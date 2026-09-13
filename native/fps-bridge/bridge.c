/* MIT. FPS signature adaptation: see LICENSE.upstream and README.md.
 * A request owns a process HANDLE, never a process-name/PID lookup.
 * No kill-on-job-close, debugger, DLL injection, or process enumeration.
 */
#define _WIN32_WINNT 0x0601
#ifndef UNICODE
#define UNICODE
#endif
#define _UNICODE
#include <windows.h>
#include <psapi.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <stdarg.h>
#include <wchar.h>

#include "registry.c"
static void diagnostic(const char *format, ...);
#include "steam.c"

static HANDLE game, job, worker, worker_stop;
static LONG worker_state; /* 0 idle, 1 scanning, 2 applying, 3 ended, 4 failed */
static LONG worker_error;
static DWORD launch_error, game_pid;
static DWORD game_exit_code, game_exit_error;
static int game_exit_known;
static unsigned generation, target;
static wchar_t directory[32768], executable[32768], game_directory[32768];
static wchar_t game_config[32768], log_path[32768];
static wchar_t steam_path[32768];
static HANDLE image_files[3];
static char token[65];
static int launched, attempted, primary_exited, released;
static CRITICAL_SECTION diagnostic_lock;
static HANDLE diagnostic_file = INVALID_HANDLE_VALUE;
static LONG diagnostic_error;

/* A directly created GUI bridge has no stable inherited console/stderr. Use
 * a request-specific file instead of the supervisor's independently opened
 * Wine log. Serialize and flush complete lines; retain the first IO failure in
 * the protocol while preserving the caller's API error state. */
static void diagnostic(const char *format, ...) {
    DWORD error = GetLastError();
    SYSTEMTIME time;
    GetSystemTime(&time);
    EnterCriticalSection(&diagnostic_lock);
    char line[262144];
    int prefix = snprintf(line, sizeof(line),
        "FPS %04u-%02u-%02uT%02u:%02u:%02u.%03uZ tick=%llu bridge=%lu thread=%lu request=%s ",
        time.wYear, time.wMonth, time.wDay, time.wHour, time.wMinute, time.wSecond, time.wMilliseconds,
        (unsigned long long)GetTickCount64(), GetCurrentProcessId(), GetCurrentThreadId(), token);
    va_list args;
    va_start(args, format);
    int body = prefix > 0 && (size_t)prefix < sizeof(line) - 1 ?
        vsnprintf(line + prefix, sizeof(line) - (size_t)prefix - 1, format, args) : -1;
    va_end(args);
    DWORD failure = 0, written = 0;
    if (body < 0 || prefix < 0 || (size_t)prefix + (size_t)body >= sizeof(line) - 1)
        failure = ERROR_BUFFER_OVERFLOW;
    else {
        DWORD length = (DWORD)(prefix + body);
        line[length++] = '\n';
        if (!WriteFile(diagnostic_file, line, length, &written, NULL)) failure = GetLastError();
        else if (written != length) failure = ERROR_WRITE_FAULT;
        else if (!FlushFileBuffers(diagnostic_file)) failure = GetLastError();
    }
    if (failure) InterlockedCompareExchange(&diagnostic_error, (LONG)failure, 0);
    LeaveCriticalSection(&diagnostic_lock);
    SetLastError(error);
}

static DWORD diagnostic_failure(void) {
    return (DWORD)InterlockedCompareExchange(&diagnostic_error, 0, 0);
}

static int open_diagnostics(void) {
    wchar_t path[32768];
    if (swprintf(path, 32768, L"%ls.bridge.log", log_path) < 0) {
        InterlockedCompareExchange(&diagnostic_error, ERROR_BUFFER_OVERFLOW, 0);
        return 0;
    }
    diagnostic_file = CreateFileW(path, GENERIC_WRITE, FILE_SHARE_READ, NULL,
        CREATE_NEW, FILE_ATTRIBUTE_NORMAL, NULL);
    if (diagnostic_file == INVALID_HANDLE_VALUE) {
        InterlockedCompareExchange(&diagnostic_error, (LONG)GetLastError(), 0);
        return 0;
    }
    return 1;
}

static int read_memory(uintptr_t address, void *buffer, SIZE_T length) {
    SIZE_T read = 0;
    BOOL ok = ReadProcessMemory(game, (void *)address, buffer, length, &read);
    if (!ok || read != length)
        diagnostic("read failed game=%lu address=0x%llx requested=%llu read=%llu ok=%d error=%lu",
            game_pid, (unsigned long long)address, (unsigned long long)length,
            (unsigned long long)read, ok, GetLastError());
    return ok && read == length;
}

/* Resolve only the documented E8 -> E9 chain ending in mov [rip+disp32],ecx.
 * Bound every read to the retained process' image and reject ambiguous results.
 */
static uintptr_t resolve_candidate(uintptr_t branch, uintptr_t base, DWORD size) {
    unsigned char bytes[6];
    int32_t displacement;
    for (unsigned hop = 0; hop < 32; hop++) {
        if (branch < base || branch - base > size - sizeof(bytes) ||
            !read_memory(branch, bytes, sizeof(bytes))) return 0;
        if ((hop == 0 && bytes[0] != 0xe8) || (hop == 1 && bytes[0] != 0xe9)) return 0;
        if (bytes[0] == 0xe8 || bytes[0] == 0xe9) {
            memcpy(&displacement, bytes + 1, 4);
            branch = branch + 5 + displacement;
        } else {
            if (bytes[0] != 0x89 || bytes[1] != 0x0d) return 0;
            memcpy(&displacement, bytes + 2, 4);
            uintptr_t address = branch + 6 + displacement;
            if (address < base || address - base > size - 4) return 0;
            MEMORY_BASIC_INFORMATION info;
            if (!VirtualQueryEx(game, (void *)address, &info, sizeof(info)) ||
                info.State != MEM_COMMIT || (info.Protect & PAGE_GUARD) ||
                !(info.Protect & (PAGE_READWRITE | PAGE_WRITECOPY |
                                 PAGE_EXECUTE_READWRITE | PAGE_EXECUTE_WRITECOPY))) return 0;
            diagnostic("candidate game=%lu address=0x%llx rva=0x%llx allocation=0x%lx current=0x%lx region=0x%llx size=%llu",
                game_pid, (unsigned long long)address, (unsigned long long)(address - base),
                info.AllocationProtect, info.Protect, (unsigned long long)(uintptr_t)info.BaseAddress,
                (unsigned long long)info.RegionSize);
            return address;
        }
    }
    return 0;
}

static uintptr_t fps_address(void) {
    HMODULE module;
    DWORD needed;
    MODULEINFO module_info;
    wchar_t image_path[32768], module_path[32768];
    IMAGE_DOS_HEADER dos;
    IMAGE_NT_HEADERS64 pe;
    if (!EnumProcessModules(game, &module, sizeof(module), &needed) ||
        !GetModuleInformation(game, module, &module_info, sizeof(module_info))) return 0;
    DWORD image_length = GetModuleFileNameExW(game, NULL, image_path, 32768);
    DWORD module_length = GetModuleFileNameExW(game, module, module_path, 32768);
    if (!image_length || image_length >= 32768 || !module_length || module_length >= 32768 ||
        _wcsicmp(image_path, module_path)) return 0;
    uintptr_t base = (uintptr_t)module_info.lpBaseOfDll;
    DWORD size = module_info.SizeOfImage;
    if (size < sizeof(pe) || !read_memory(base, &dos, sizeof(dos)) || dos.e_magic != IMAGE_DOS_SIGNATURE ||
        dos.e_lfanew < 0 || (DWORD)dos.e_lfanew > size - sizeof(pe) ||
        !read_memory(base + dos.e_lfanew, &pe, sizeof(pe)) || pe.Signature != IMAGE_NT_SIGNATURE ||
        pe.OptionalHeader.Magic != IMAGE_NT_OPTIONAL_HDR64_MAGIC || pe.FileHeader.NumberOfSections > 96) return 0;
    diagnostic("image game=%lu path=%ls base=0x%llx size=%lu timestamp=%lu machine=0x%x",
        game_pid, image_path, (unsigned long long)base, size, pe.FileHeader.TimeDateStamp, pe.FileHeader.Machine);
    uintptr_t sections = base + dos.e_lfanew + 24 + pe.FileHeader.SizeOfOptionalHeader;
    uintptr_t found = 0;
    unsigned char buffer[65536 + 5];
    for (unsigned s = 0; s < pe.FileHeader.NumberOfSections; s++) {
        IMAGE_SECTION_HEADER section;
        uintptr_t at = sections + s * sizeof(section);
        if (at < base || at - base > size - sizeof(section) || !read_memory(at, &section, sizeof(section))) return 0;
        if (memcmp(section.Name, "il2cpp\0\0", 8)) continue;
        DWORD length = section.Misc.VirtualSize;
        if (section.VirtualAddress > size || length > size - section.VirtualAddress) return 0;
        for (DWORD offset = 0; offset < length; offset += 65536) {
            if (WaitForSingleObject(worker_stop, 0) != WAIT_TIMEOUT || WaitForSingleObject(game, 0) != WAIT_TIMEOUT) return 0;
            DWORD count = length - offset < sizeof(buffer) ? length - offset : sizeof(buffer);
            if (!read_memory(base + section.VirtualAddress + offset, buffer, count)) return 0;
            for (DWORD i = 0; i + 6 <= count && i < 65536; i++) {
                static const unsigned char pattern[] = {0xb9, 0x3c, 0, 0, 0, 0xe8};
                if (memcmp(buffer + i, pattern, sizeof(pattern))) continue;
                uintptr_t address = resolve_candidate(base + section.VirtualAddress + offset + i + 5, base, size);
                if (address && found && address != found) {
                    diagnostic("ambiguous FPS candidates; no target selected");
                    return 0;
                }
                if (address) found = address;
            }
        }
    }
    return found;
}

static DWORD WINAPI apply_fps(void *unused) {
    (void)unused;
    diagnostic("worker scanning generation=%u game=%lu target=%u", generation, game_pid, target);
    uintptr_t address = diagnostic_failure() ? 0 : fps_address();
    if (!address) {
        diagnostic("worker resolution failed generation=%u game=%lu; no FPS write issued", generation, game_pid);
        InterlockedExchange(&worker_error, (LONG)(diagnostic_failure() ? diagnostic_failure() : ERROR_NOT_FOUND));
        InterlockedExchange(&worker_state, 4);
        return 1;
    }
    InterlockedExchange(&worker_state, 2);
    diagnostic("worker applying generation=%u game=%lu address=0x%llx target=%u", generation, game_pid,
        (unsigned long long)address, target);
    HANDLE waits[] = {worker_stop, game};
    DWORD wait;
    int observed = 0, previous = 0;
    while ((wait = WaitForMultipleObjects(2, waits, FALSE, 0)) == WAIT_TIMEOUT) {
        if (diagnostic_failure()) {
            InterlockedExchange(&worker_error, (LONG)diagnostic_failure());
            InterlockedExchange(&worker_state, 4);
            return 1;
        }
        int current;
        SIZE_T written = 0;
        int ok = read_memory(address, &current, sizeof(current));
        if (ok && (!observed || previous != current)) {
            diagnostic("read generation=%u game=%lu address=0x%llx value=%d target=%u action=%s", generation,
                game_pid, (unsigned long long)address, current, target, current == (int)target ? "equal" : "write");
            observed = 1; previous = current;
        }
        if (ok && current != (int)target) {
            diagnostic("write begin generation=%u game=%lu address=0x%llx read=%d target=%u bytes=%llu", generation,
                game_pid, (unsigned long long)address, current, target, (unsigned long long)sizeof(target));
            /* Never proceed with an unrecorded FPS write after logging fails. */
            if (diagnostic_failure()) {
                InterlockedExchange(&worker_error, (LONG)diagnostic_failure());
                InterlockedExchange(&worker_state, 4);
                return 1;
            }
            BOOL result = WriteProcessMemory(game, (void *)address, &target, sizeof(target), &written);
            diagnostic("write end generation=%u game=%lu ok=%d written=%llu error=%lu", generation,
                game_pid, result, (unsigned long long)written, result ? 0 : GetLastError());
            ok = result && written == sizeof(target);
        }
        if (!ok) {
            DWORD error = GetLastError();
            InterlockedExchange(&worker_error, error ? (LONG)error : ERROR_WRITE_FAULT);
            InterlockedExchange(&worker_state, 4);
            diagnostic("worker read/write failed generation=%u error=%lu", generation, error);
            return 1;
        }
        wait = WaitForMultipleObjects(2, waits, FALSE, 200);
        if (wait != WAIT_TIMEOUT) break;
    }
    if (wait == WAIT_FAILED) {
        InterlockedExchange(&worker_error, (LONG)GetLastError());
        InterlockedExchange(&worker_state, 4);
    } else InterlockedExchange(&worker_state, 3);
    diagnostic("worker ended generation=%u state=%ld", generation, InterlockedCompareExchange(&worker_state, 0, 0));
    return 0;
}

static DWORD job_processes(HANDLE selected_job) {
    if (!selected_job) return 0;
    JOBOBJECT_BASIC_ACCOUNTING_INFORMATION info;
    if (!QueryInformationJobObject(selected_job, JobObjectBasicAccountingInformation, &info, sizeof(info), NULL)) return MAXDWORD;
    return info.ActiveProcesses;
}

static DWORD active_processes(void) { return job_processes(job); }

static int observe_game_exit(void) {
    if (game) {
        DWORD wait = WaitForSingleObject(game, 0);
        if (wait == WAIT_OBJECT_0) {
            primary_exited = 1;
            if (!game_exit_known) {
                if (GetExitCodeProcess(game, &game_exit_code)) {
                    game_exit_known = 1; game_exit_error = 0;
                    diagnostic("game exit game=%lu code=0x%08lx generation=%u", game_pid, game_exit_code, generation);
                } else game_exit_error = GetLastError();
            }
        }
        else if (wait != WAIT_TIMEOUT) return 0;
    }
    return 1;
}

static int write_status(unsigned sequence, DWORD error) {
    wchar_t path[32768], temporary[32768];
    if (swprintf(path, 32768, L"%ls\\response", directory) < 0 ||
        swprintf(temporary, 32768, L"%ls\\response.tmp", directory) < 0) return 0;
    DWORD active = active_processes();
    if (!observe_game_exit()) active = MAXDWORD;
    int worker_done = !worker || WaitForSingleObject(worker, 0) == WAIT_OBJECT_0;
    if (shim) {
        DWORD wait = WaitForSingleObject(shim, 0);
        if (wait == WAIT_OBJECT_0) {
            /* The child may exit between the first poll and this shim poll.
             * Reobserve it before classifying the shim's propagated exit code. */
            if (!observe_game_exit()) active = MAXDWORD;
            DWORD code = 0;
            if (!shim_exited && !steam_error) {
                if (!GetExitCodeProcess(shim, &code)) steam_error = GetLastError();
                /* The direct signed shim returns its retained child's status.
                 * Preserve a different shim failure; don't report the game's
                 * already-recorded exception again as an independent failure. */
                else if (code && (!game_exit_known || code != game_exit_code)) steam_error = code;
            }
            shim_exited = 1;
        }
        else if (wait != WAIT_TIMEOUT) active = MAXDWORD;
    }
    char data[1024];
    int length = snprintf(data, sizeof(data),
        "{\"version\":3,\"token\":\"%s\",\"sequence\":%u,\"launched\":%d,\"pid\":%lu,\"primaryExited\":%d,\"active\":%lu,\"generation\":%u,\"workerState\":%ld,\"workerDone\":%d,\"workerError\":%lu,\"launchError\":%lu,\"error\":%lu,\"released\":%d,\"shimPid\":%lu,\"shimExited\":%d,\"steamReady\":%d,\"steamError\":%lu,\"steamActive\":%lu,\"exitCodeKnown\":%d,\"exitCode\":%lu,\"exitCodeError\":%lu,\"diagnosticError\":%lu}\n",
        token, sequence, launched, game_pid, primary_exited, active, generation,
        InterlockedCompareExchange(&worker_state, 0, 0), worker_done, (DWORD)InterlockedCompareExchange(&worker_error, 0, 0), launch_error, error, released,
        shim_pid, shim_exited, steam_acknowledged, steam_error, job_processes(steam_job),
        game_exit_known, game_exit_code, game_exit_error, diagnostic_failure());
    HANDLE file = CreateFileW(temporary, GENERIC_WRITE, 0, NULL, CREATE_ALWAYS, FILE_ATTRIBUTE_NORMAL, NULL);
    if (file == INVALID_HANDLE_VALUE) return 0;
    DWORD written;
    int ok = WriteFile(file, data, length, &written, NULL) && written == (DWORD)length && FlushFileBuffers(file);
    CloseHandle(file);
    return ok && MoveFileExW(temporary, path, MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH);
}

static DWORD never_resumed_failure(PROCESS_INFORMATION *process, DWORD error) {
    if (!TerminateProcess(process->hProcess, error) ||
        WaitForSingleObject(process->hProcess, INFINITE) != WAIT_OBJECT_0) return ERROR_PROCESS_ABORTED;
    return error;
}

static DWORD start_steam(void) {
    DWORD error = 0;
    wchar_t command[32768];
    const wchar_t *quote = wcspbrk(executable, L" \t") ? L"\"" : L"";
    if (wcschr(steam_path, L'"') || swprintf(command, 32768, L"\"%ls\" %ls%ls%ls", steam_path, quote, executable, quote) < 0)
        return ERROR_INVALID_PARAMETER;
    STARTUPINFOW startup = {0}; PROCESS_INFORMATION process = {0}; startup.cb = sizeof(startup);
    wchar_t steam_log[32768];
    if (swprintf(steam_log, 32768, L"%ls.steam.log", log_path) < 0) return ERROR_INVALID_PARAMETER;
    SECURITY_ATTRIBUTES security = {sizeof(security), NULL, TRUE};
    HANDLE output = CreateFileW(steam_log, GENERIC_WRITE, FILE_SHARE_READ | FILE_SHARE_WRITE,
        &security, CREATE_ALWAYS, FILE_ATTRIBUTE_NORMAL, NULL);
    if (output == INVALID_HANDLE_VALUE) return GetLastError();
    startup.dwFlags = STARTF_USESTDHANDLES;
    startup.hStdOutput = startup.hStdError = output;
    startup.hStdInput = GetStdHandle(STD_INPUT_HANDLE);
    BOOL created = CreateProcessW(steam_path, command, NULL, NULL, TRUE, CREATE_SUSPENDED, NULL, NULL, &startup, &process);
    error = created ? 0 : GetLastError();
    CloseHandle(output);
    if (!created) return error;
    shim = process.hProcess; shim_pid = process.dwProcessId;
    /* The Steam job owns the entire tree before any shim instruction.
     * No breakaway and no kill-on-close; root exit never releases descendants. */
    if (!AssignProcessToJobObject(steam_job, shim))
        error = never_resumed_failure(&process, GetLastError());
    else if (ResumeThread(process.hThread) == (DWORD)-1) error = never_resumed_failure(&process, GetLastError());
    CloseHandle(process.hThread);
    if (error) return error;
    diagnostic("Steam direct creation shim=%lu command=%ls; Steam job assigned before resume", shim_pid, command);
    ULONGLONG deadline = GetTickCount64() + 10000;
    do {
        error = acquire_steam_child(steam_job, executable, &game);
        if (error != ERROR_RETRY) break;
        Sleep(1); /* Wait only for the actual creation handle, never delay a game. */
    } while (GetTickCount64() < deadline);
    if (error == ERROR_RETRY) error = ERROR_TIMEOUT;
    if (error) {
        diagnostic("Steam child ownership failed shim=%lu error=%lu; request jobs remain owned", shim_pid, error);
        return error;
    }
    game_pid = GetProcessId(game);
    /* Keep the exact HANDLE even if admission fails after direct creation. The
     * game is already running: never terminate it to hide an ownership failure.
     * A second cumulative check proves no descendant preceded nested assignment. */
    JOBOBJECT_BASIC_ACCOUNTING_INFORMATION accounting;
    if (!AssignProcessToJobObject(job, game)) error = GetLastError();
    else if (!QueryInformationJobObject(steam_job, JobObjectBasicAccountingInformation, &accounting, sizeof(accounting), NULL)) error = GetLastError();
    else if (accounting.TotalProcesses != 2) error = ERROR_INVALID_DATA;
    if (error) {
        diagnostic("Steam game admission failed game=%lu error=%lu; retained game and Steam job await exit", game_pid, error);
        return error;
    }
    launched = 1;
    steam_acknowledged = 1;
    wchar_t image[32768] = {0}, cwd[32768] = {0};
    DWORD length = 32768;
    BOOL identified = QueryFullProcessImageNameW(shim, 0, image, &length);
    GetCurrentDirectoryW(32768, cwd);
    diagnostic("Steam ready shim=%lu image=%ls imageError=%lu; retained direct child game=%lu totalProcesses=2", shim_pid,
        image, identified ? 0 : GetLastError(), game_pid);
    diagnostic("game adopted game=%lu parent=%lu shim=%lu cwd=%ls gameDXMT=%ls command=%ls", game_pid,
        parent_pid(game), shim_pid, cwd, game_config, command);
    return 0;
}

/* Wine lazily creates explorer /desktop in the first window user's process
 * context. Prepare that runtime infrastructure from the bridge before any
 * game-owned process exists. Otherwise explorer inherits the game's job but
 * waits for this bridge to exit, while this bridge correctly waits for that
 * job to empty. Runtime helpers remain covered by the final owned Wine wait. */
static DWORD prepare_desktop(void) {
    HWND desktop = GetDesktopWindow();
    DWORD pid = 0;
    if (!desktop || !GetWindowThreadProcessId(desktop, &pid) || !pid || pid == GetCurrentProcessId())
        return ERROR_NOT_READY;
    HANDLE owner = OpenProcess(PROCESS_QUERY_INFORMATION | SYNCHRONIZE, FALSE, pid);
    if (!owner) return GetLastError();
    BOOL own = FALSE, steam = FALSE;
    DWORD error = 0;
    if (!IsProcessInJob(owner, job, &own) ||
        (steam_job && !IsProcessInJob(owner, steam_job, &steam))) error = GetLastError();
    else if (own || steam || WaitForSingleObject(owner, 0) != WAIT_TIMEOUT) error = ERROR_INVALID_STATE;
    diagnostic("desktop prepared hwnd=0x%llx owner=%lu gameJobMember=%d steamJobMember=%d error=%lu; runtime infrastructure precedes game creation",
        (unsigned long long)(uintptr_t)desktop, pid, own, steam, error);
    CloseHandle(owner);
    return error ? error : diagnostic_failure();
}

static DWORD launch(void) {
    if (attempted) return ERROR_ALREADY_EXISTS;
    attempted = 1;
    if (*steam_path) {
        steam_error = validate_steam_environment();
        if (!steam_error) steam_error = validate_steam_bootstrap();
        if (steam_error) return steam_error;
    }
    if (diagnostic_failure()) return diagnostic_failure();
    DWORD desktop_error = prepare_desktop();
    if (desktop_error) return desktop_error;
    wchar_t command[32768], previous[32768];
    if (wcschr(executable, L'"') || swprintf(command, 32768,
        L"\"%ls\" -platform_type CLOUD_THIRD_PARTY_PC -is_cloud 1", executable) < 0) return ERROR_INVALID_PARAMETER;
    DWORD n = GetEnvironmentVariableW(L"DXMT_CONFIG", previous, 32768);
    if (n >= 32768 || !SetEnvironmentVariableW(L"DXMT_CONFIG", game_config)) return ERROR_INVALID_PARAMETER;
    if (*steam_path) {
        steam_error = start_steam();
        SetEnvironmentVariableW(L"DXMT_CONFIG", n ? previous : NULL);
        return steam_error;
    }
    STARTUPINFOW startup = {0}; PROCESS_INFORMATION process = {0}; startup.cb = sizeof(startup);
    SECURITY_ATTRIBUTES security = {sizeof(security), NULL, TRUE};
    HANDLE output = CreateFileW(log_path, GENERIC_WRITE, FILE_SHARE_READ | FILE_SHARE_WRITE,
        &security, CREATE_ALWAYS, FILE_ATTRIBUTE_NORMAL, NULL);
    if (output == INVALID_HANDLE_VALUE) {
        DWORD error = GetLastError();
        SetEnvironmentVariableW(L"DXMT_CONFIG", n ? previous : NULL);
        return error;
    }
    startup.dwFlags = STARTF_USESTDHANDLES;
    startup.hStdOutput = startup.hStdError = output;
    startup.hStdInput = GetStdHandle(STD_INPUT_HANDLE);
    BOOL ok = CreateProcessW(executable, command, NULL, NULL, TRUE,
        CREATE_SUSPENDED, NULL, game_directory, &startup, &process);
    DWORD error = ok ? 0 : GetLastError();
    SetEnvironmentVariableW(L"DXMT_CONFIG", n ? previous : NULL);
    CloseHandle(output);
    if (!ok) return error;
    game = process.hProcess;
    game_pid = process.dwProcessId;
    diagnostic("game created suspended game=%lu parent=%lu shim=0", game_pid, parent_pid(game));
    if (!AssignProcessToJobObject(job, game)) error = never_resumed_failure(&process, GetLastError());
    else if (ResumeThread(process.hThread) == (DWORD)-1) error = never_resumed_failure(&process, GetLastError());
    else {
        launched = 1;
        diagnostic("game resumed game=%lu parent=%lu shim=0 cwd=%ls gameDXMT=%ls command=%ls", game_pid,
            parent_pid(game), game_directory, game_config, command);
    }
    CloseHandle(process.hThread);
    return error;
}

int wmain(int argc, wchar_t **argv) {
    if (argc > 1 && !wcscmp(argv[1], L"--registry")) return registry_main(argc, argv);
    if ((argc != 7 && argc != 8) || wcslen(argv[1]) > 32000 || wcslen(argv[2]) != 64) return 2;
    for (unsigned i = 0; i < 64; i++) {
        if (!((argv[2][i] >= L'0' && argv[2][i] <= L'9') || (argv[2][i] >= L'a' && argv[2][i] <= L'f'))) return 2;
        token[i] = (char)argv[2][i];
    }
    for (int i = 3; i < argc; i++) if (wcslen(argv[i]) > 32000) return 2;
    wcscpy(directory, argv[1]); wcscpy(executable, argv[3]);
    wcscpy(game_directory, argv[4]); wcscpy(game_config, argv[5]); wcscpy(log_path, argv[6]);
    if (argc == 8) wcscpy(steam_path, argv[7]);
    InitializeCriticalSection(&diagnostic_lock);
    if (!open_diagnostics()) {
        /* Capability response is useful even when the mandatory log cannot be
         * created. No game, shim or job has been created at this point. */
        write_status(0, diagnostic_failure());
        return 3;
    }
    diagnostic("bridge version=3 game=%ls route=%s log=%ls consoleWindow=0x%llx", executable, *steam_path ? "steam-patch" : "direct", log_path,
        (unsigned long long)(uintptr_t)GetConsoleWindow());
    if (diagnostic_failure()) { write_status(0, diagnostic_failure()); return 3; }
    /* Deny cooperating Win32 writers/deleters for every selected image until
     * release. POSIX same-user/admin replacement remains a documented limit. */
    wchar_t self[32768], dll[32768];
    if (!GetModuleFileNameW(NULL, self, 32768)) return 3;
    if (*steam_path) {
        wcscpy(dll, steam_path);
        wchar_t *slash = wcsrchr(dll, L'\\');
        if (!slash || swprintf(slash + 1, 32768 - (slash + 1 - dll), L"lsteamclient.dll") < 0) return 3;
    }
    const wchar_t *images[] = {self, steam_path, dll};
    for (unsigned i = 0; i < (*steam_path ? 3u : 1u); i++) {
        image_files[i] = CreateFileW(images[i], GENERIC_READ, FILE_SHARE_READ, NULL, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, NULL);
        if (image_files[i] == INVALID_HANDLE_VALUE) return 3;
    }
    job = CreateJobObjectW(NULL, NULL);
    if (*steam_path) steam_job = CreateJobObjectW(NULL, NULL);
    worker_stop = CreateEventW(NULL, TRUE, FALSE, NULL);
    /* Fail capabilities before any game creation. No breakaway/kill-on-close. */
    JOBOBJECT_EXTENDED_LIMIT_INFORMATION limits = {0};
    if (!job || !worker_stop || !SetInformationJobObject(job, JobObjectExtendedLimitInformation, &limits, sizeof(limits)) ||
        active_processes() != 0) return 3;
    if (*steam_path && (!steam_job || !SetInformationJobObject(steam_job, JobObjectExtendedLimitInformation, &limits, sizeof(limits)) ||
        job_processes(steam_job) != 0)) return 3;
    if (*steam_path) {
        SteamHandleSnapshot *preflight = NULL;
        DWORD error = steam_handle_snapshot(&preflight);
        if (error) {
            diagnostic("Steam child-handle capability unavailable error=%lu; no shim or game created", error);
            return 3;
        }
        HeapFree(GetProcessHeap(), 0, preflight);
    }
    wchar_t path[32768];
    swprintf(path, 32768, L"%ls\\command", directory);
    unsigned last = 0;
    if (!write_status(0, 0)) return 4;
    while (!released) {
        HANDLE file = CreateFileW(path, GENERIC_READ, FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
            NULL, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, NULL);
        if (file != INVALID_HANDLE_VALUE) {
            char data[256] = {0}, request_token[65] = {0}, operation[24] = {0}, tail;
            DWORD count = 0;
            unsigned sequence = 0, argument = 0, requested_generation = 0;
            BOOL read = ReadFile(file, data, sizeof(data) - 1, &count, NULL);
            CloseHandle(file);
            /* Exact framing and monotonically increasing sequence. A malformed
             * or different request cannot issue a launch or change the target. */
            int fields = sscanf(data, "%64s %u %23s %u %u %c", request_token, &sequence, operation, &requested_generation, &argument, &tail);
            char canonical[256];
            snprintf(canonical, sizeof(canonical), "%s %u %s %u %u\n", request_token, sequence, operation, requested_generation, argument);
            if (read && fields == 5 && !strcmp(data, canonical) && !strcmp(request_token, token) && sequence != 0 && sequence == last + 1) {
                DWORD error = 0;
                if ((!strcmp(operation, "start") ? 0 : argument != 0) ||
                    (strcmp(operation, "start") && strcmp(operation, "stop") && requested_generation != 0)) error = ERROR_INVALID_PARAMETER;
                else if ((!strcmp(operation, "launch") || !strcmp(operation, "start")) && diagnostic_failure())
                    error = diagnostic_failure();
                else if (!strcmp(operation, "launch")) launch_error = error = launch();
                else if (!strcmp(operation, "start")) {
                    if (!launched || primary_exited || requested_generation != generation + 1 || argument < 1 || argument > 360 ||
                        (worker && WaitForSingleObject(worker, 0) != WAIT_OBJECT_0) || WaitForSingleObject(game, 0) != WAIT_TIMEOUT) error = ERROR_INVALID_STATE;
                    else {
                        if (worker) CloseHandle(worker);
                        ResetEvent(worker_stop);
                        generation = requested_generation; target = argument; InterlockedExchange(&worker_error, 0);
                        diagnostic("worker start requested generation=%u game=%lu target=%u", generation, game_pid, target);
                        if (diagnostic_failure()) {
                            error = diagnostic_failure();
                            InterlockedExchange(&worker_error, (LONG)error);
                            InterlockedExchange(&worker_state, 4);
                        }
                        InterlockedExchange(&worker_state, error ? 4 : 1);
                        worker = error ? NULL : CreateThread(NULL, 0, apply_fps, NULL, 0, NULL);
                        if (!worker && !error) { error = GetLastError(); InterlockedExchange(&worker_error, (LONG)error); InterlockedExchange(&worker_state, 4); }
                    }
                } else if (!strcmp(operation, "stop")) {
                    if (requested_generation != generation) error = ERROR_INVALID_STATE;
                    else if (!SetEvent(worker_stop)) error = GetLastError();
                } else if (!strcmp(operation, "release")) {
                    if (active_processes() != 0 || job_processes(steam_job) != 0 || (game && WaitForSingleObject(game, 0) != WAIT_OBJECT_0) ||
                        (shim && WaitForSingleObject(shim, 0) != WAIT_OBJECT_0) ||
                        (worker && WaitForSingleObject(worker, 0) != WAIT_OBJECT_0)) error = ERROR_BUSY;
                    else released = 1;
                } else if (strcmp(operation, "probe")) error = ERROR_INVALID_FUNCTION;
                last = sequence;
                /* If IO fails, stay alive with the process handles. Never infer
                 * completion or terminate a running game from mailbox failure. */
                while (!write_status(last, error)) Sleep(100);
            }
        }
        if (game && WaitForSingleObject(game, 0) == WAIT_OBJECT_0) {
            primary_exited = 1;
            SetEvent(worker_stop);
        }
        Sleep(20);
    }
    if (worker) CloseHandle(worker);
    if (game) CloseHandle(game);
    close_steam();
    for (unsigned i = 0; i < (*steam_path ? 3u : 1u); i++) CloseHandle(image_files[i]);
    CloseHandle(worker_stop); CloseHandle(job);
    CloseHandle(diagnostic_file);
    DeleteCriticalSection(&diagnostic_lock);
    return 0;
}

#ifndef FPS_BRIDGE_NO_GUI_ENTRY
int WINAPI wWinMain(HINSTANCE instance, HINSTANCE previous, wchar_t *command, int show) {
    (void)instance; (void)previous; (void)command; (void)show;
    return wmain(__argc, __wargv);
}
#endif
