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
#include <wchar.h>

#include "registry.c"

static HANDLE game, job, worker, worker_stop;
static LONG worker_state; /* 0 idle, 1 scanning, 2 applying, 3 ended, 4 failed */
static LONG worker_error;
static DWORD launch_error, game_pid;
static unsigned generation, target;
static wchar_t directory[32768], executable[32768], game_directory[32768];
static wchar_t game_config[32768], log_path[32768];
static char token[65];
static int launched, attempted, primary_exited, released;

static int read_memory(uintptr_t address, void *buffer, SIZE_T length) {
    SIZE_T read = 0;
    return ReadProcessMemory(game, (void *)address, buffer, length, &read) && read == length;
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
                if (address && found && address != found) return 0;
                if (address) found = address;
            }
        }
    }
    return found;
}

static DWORD WINAPI apply_fps(void *unused) {
    (void)unused;
    uintptr_t address = fps_address();
    if (!address) {
        InterlockedExchange(&worker_error, ERROR_NOT_FOUND);
        InterlockedExchange(&worker_state, 4);
        return 1;
    }
    InterlockedExchange(&worker_state, 2);
    HANDLE waits[] = {worker_stop, game};
    DWORD wait;
    while ((wait = WaitForMultipleObjects(2, waits, FALSE, 0)) == WAIT_TIMEOUT) {
        int current;
        SIZE_T written;
        if (!read_memory(address, &current, sizeof(current)) ||
            (current != (int)target && (!WriteProcessMemory(game, (void *)address, &target, sizeof(target), &written) || written != sizeof(target)))) {
            DWORD error = GetLastError();
            InterlockedExchange(&worker_error, error ? (LONG)error : ERROR_WRITE_FAULT);
            InterlockedExchange(&worker_state, 4);
            return 1;
        }
        wait = WaitForMultipleObjects(2, waits, FALSE, 200);
        if (wait != WAIT_TIMEOUT) break;
    }
    if (wait == WAIT_FAILED) {
        InterlockedExchange(&worker_error, (LONG)GetLastError());
        InterlockedExchange(&worker_state, 4);
    } else InterlockedExchange(&worker_state, 3);
    return 0;
}

static DWORD active_processes(void) {
    JOBOBJECT_BASIC_ACCOUNTING_INFORMATION info;
    if (!QueryInformationJobObject(job, JobObjectBasicAccountingInformation, &info, sizeof(info), NULL)) return MAXDWORD;
    return info.ActiveProcesses;
}

static int write_status(unsigned sequence, DWORD error) {
    wchar_t path[32768], temporary[32768];
    if (swprintf(path, 32768, L"%ls\\response", directory) < 0 ||
        swprintf(temporary, 32768, L"%ls\\response.tmp", directory) < 0) return 0;
    DWORD active = active_processes();
    if (game) {
        DWORD wait = WaitForSingleObject(game, 0);
        if (wait == WAIT_OBJECT_0) primary_exited = 1;
        else if (wait != WAIT_TIMEOUT) active = MAXDWORD;
    }
    int worker_done = !worker || WaitForSingleObject(worker, 0) == WAIT_OBJECT_0;
    char data[1024];
    int length = snprintf(data, sizeof(data),
        "{\"version\":1,\"token\":\"%s\",\"sequence\":%u,\"launched\":%d,\"pid\":%lu,\"primaryExited\":%d,\"active\":%lu,\"generation\":%u,\"workerState\":%ld,\"workerDone\":%d,\"workerError\":%lu,\"launchError\":%lu,\"error\":%lu,\"released\":%d}\n",
        token, sequence, launched, game_pid, primary_exited, active, generation,
        InterlockedCompareExchange(&worker_state, 0, 0), worker_done, (DWORD)InterlockedCompareExchange(&worker_error, 0, 0), launch_error, error, released);
    HANDLE file = CreateFileW(temporary, GENERIC_WRITE, 0, NULL, CREATE_ALWAYS, FILE_ATTRIBUTE_NORMAL, NULL);
    if (file == INVALID_HANDLE_VALUE) return 0;
    DWORD written;
    int ok = WriteFile(file, data, length, &written, NULL) && written == (DWORD)length && FlushFileBuffers(file);
    CloseHandle(file);
    return ok && MoveFileExW(temporary, path, MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH);
}

static DWORD launch(void) {
    if (attempted) return ERROR_ALREADY_EXISTS;
    attempted = 1;
    wchar_t command[32768], previous[32768];
    if (wcschr(executable, L'"') || swprintf(command, 32768,
        L"\"%ls\" -platform_type CLOUD_THIRD_PARTY_PC -is_cloud 1", executable) < 0) return ERROR_INVALID_PARAMETER;
    DWORD n = GetEnvironmentVariableW(L"DXMT_CONFIG", previous, 32768);
    if (n >= 32768 || !SetEnvironmentVariableW(L"DXMT_CONFIG", game_config)) return ERROR_INVALID_PARAMETER;
    STARTUPINFOW startup = {0};
    PROCESS_INFORMATION process = {0};
    startup.cb = sizeof(startup);
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
    BOOL ok = CreateProcessW(executable, command, NULL, NULL, TRUE, CREATE_SUSPENDED, NULL, game_directory, &startup, &process);
    DWORD error = ok ? 0 : GetLastError();
    SetEnvironmentVariableW(L"DXMT_CONFIG", n ? previous : NULL);
    CloseHandle(output);
    if (!ok) return error;
    game = process.hProcess;
    game_pid = process.dwProcessId;
    /* Before ResumeThread, this is an owned, never-run failed launch. */
    if (!AssignProcessToJobObject(job, game)) {
        error = GetLastError();
        if (!TerminateProcess(game, error) || WaitForSingleObject(game, INFINITE) != WAIT_OBJECT_0) error = ERROR_PROCESS_ABORTED;
    } else if (ResumeThread(process.hThread) == (DWORD)-1) {
        error = GetLastError();
        if (!TerminateProcess(game, error) || WaitForSingleObject(game, INFINITE) != WAIT_OBJECT_0) error = ERROR_PROCESS_ABORTED;
    } else launched = 1;
    CloseHandle(process.hThread);
    return error;
}

int wmain(int argc, wchar_t **argv) {
    if (argc > 1 && !wcscmp(argv[1], L"--registry")) return registry_main(argc, argv);
    if (argc != 7 || wcslen(argv[1]) > 32000 || wcslen(argv[2]) != 64) return 2;
    for (unsigned i = 0; i < 64; i++) {
        if (!((argv[2][i] >= L'0' && argv[2][i] <= L'9') || (argv[2][i] >= L'a' && argv[2][i] <= L'f'))) return 2;
        token[i] = (char)argv[2][i];
    }
    for (unsigned i = 3; i < 7; i++) if (wcslen(argv[i]) > 32000) return 2;
    wcscpy(directory, argv[1]); wcscpy(executable, argv[3]);
    wcscpy(game_directory, argv[4]); wcscpy(game_config, argv[5]); wcscpy(log_path, argv[6]);
    job = CreateJobObjectW(NULL, NULL);
    worker_stop = CreateEventW(NULL, TRUE, FALSE, NULL);
    /* Fail capabilities before any game creation. No breakaway/kill-on-close. */
    JOBOBJECT_EXTENDED_LIMIT_INFORMATION limits = {0};
    if (!job || !worker_stop || !SetInformationJobObject(job, JobObjectExtendedLimitInformation, &limits, sizeof(limits)) ||
        active_processes() != 0) return 3;
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
                else if (!strcmp(operation, "launch")) launch_error = error = launch();
                else if (!strcmp(operation, "start")) {
                    if (!launched || primary_exited || requested_generation != generation + 1 || argument < 1 || argument > 360 ||
                        (worker && WaitForSingleObject(worker, 0) != WAIT_OBJECT_0) || WaitForSingleObject(game, 0) != WAIT_TIMEOUT) error = ERROR_INVALID_STATE;
                    else {
                        if (worker) CloseHandle(worker);
                        ResetEvent(worker_stop);
                        generation = requested_generation; target = argument; InterlockedExchange(&worker_error, 0);
                        InterlockedExchange(&worker_state, 1);
                        worker = CreateThread(NULL, 0, apply_fps, NULL, 0, NULL);
                        if (!worker) { error = GetLastError(); InterlockedExchange(&worker_error, (LONG)error); InterlockedExchange(&worker_state, 4); }
                    }
                } else if (!strcmp(operation, "stop")) {
                    if (requested_generation != generation) error = ERROR_INVALID_STATE;
                    else if (!SetEvent(worker_stop)) error = GetLastError();
                } else if (!strcmp(operation, "release")) {
                    if (active_processes() != 0 || (game && WaitForSingleObject(game, 0) != WAIT_OBJECT_0) ||
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
    CloseHandle(worker_stop); CloseHandle(job);
    return 0;
}
