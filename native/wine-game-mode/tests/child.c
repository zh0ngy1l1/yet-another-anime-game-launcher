/* Bounded routing fixture; never opens or modifies game data. */
#include <windows.h>
#include <stdio.h>
#include <wchar.h>

/* Reproduce the FPS target's image mapping: executable allocation, currently
 * WRITECOPY data. The child waits during the write so the old transient
 * NOACCESS bug is observable in +virtual without deliberately racing a crash. */
static volatile LONG r2_data[1024] __attribute__((section(".r2data"), aligned(4096))) = {60};

static int memory_fixture(int argc, wchar_t **argv)
{
    struct { ULONG_PTR address; MEMORY_BASIC_INFORMATION info; } ready;
    DWORD bytes, exit_code;
    if (argc == 4 && !wcscmp(argv[1], L"--r2-child"))
    {
        HANDLE pipe = (HANDLE)(ULONG_PTR)_wcstoui64(argv[2], NULL, 10);
        HANDLE done = (HANDLE)(ULONG_PTR)_wcstoui64(argv[3], NULL, 10);
        ready.address = (ULONG_PTR)r2_data;
        if (!VirtualQuery((void *)r2_data, &ready.info, sizeof(ready.info)) ||
            !WriteFile(pipe, &ready, sizeof(ready), &bytes, NULL) || bytes != sizeof(ready)) return 80;
        if (WaitForSingleObject(done, INFINITE) != WAIT_OBJECT_0) return 81;
        return r2_data[0] == 150 ? 0 : 82;
    }
    if (argc != 3 || wcscmp(argv[1], L"--r2-parent")) return -1;
    SECURITY_ATTRIBUTES sa = {sizeof(sa), NULL, TRUE};
    HANDLE input, output, done = CreateEventW(&sa, TRUE, FALSE, NULL);
    if (!done || !CreatePipe(&input, &output, &sa, 0)) return 83;
    wchar_t command[32768];
    swprintf(command, 32768, L"\"%ls\" --r2-child %llu %llu", argv[2],
             (unsigned long long)(ULONG_PTR)output, (unsigned long long)(ULONG_PTR)done);
    STARTUPINFOW startup = {sizeof(startup)};
    PROCESS_INFORMATION process;
    if (!CreateProcessW(argv[2], command, NULL, NULL, TRUE, 0, NULL, NULL, &startup, &process)) return 84;
    CloseHandle(output);
    int ok = ReadFile(input, &ready, sizeof(ready), &bytes, NULL) && bytes == sizeof(ready);
    ok = ok && ready.info.AllocationProtect == PAGE_EXECUTE_WRITECOPY && ready.info.Protect == PAGE_WRITECOPY;
    if (ok)
    {
        LONG target = 150, actual = 0;
        SIZE_T transferred;
        fprintf(stderr, "YAAGL_R2_WRITE_BEGIN allocation=0x%lx current=0x%lx address=%p\n",
                ready.info.AllocationProtect, ready.info.Protect, (void *)ready.address);
        fflush(stderr);
        ok = WriteProcessMemory(process.hProcess, (void *)ready.address, &target, sizeof(target), &transferred) &&
             transferred == sizeof(target);
        fprintf(stderr, "YAAGL_R2_WRITE_END ok=%d\n", ok);
        fflush(stderr);
        ok = ok && ReadProcessMemory(process.hProcess, (void *)ready.address, &actual, sizeof(actual), &transferred) &&
             transferred == sizeof(actual) && actual == target;
    }
    SetEvent(done);
    WaitForSingleObject(process.hProcess, INFINITE);
    ok = GetExitCodeProcess(process.hProcess, &exit_code) && exit_code == 0 && ok;
    CloseHandle(process.hThread);
    CloseHandle(process.hProcess);
    CloseHandle(input);
    CloseHandle(done);
    return ok ? 0 : 85;
}

int wmain(int argc, wchar_t **argv)
{
    int memory = memory_fixture(argc, argv);
    if (memory >= 0) return memory;
    if (argc > 1 && !wcscmp(argv[1], L"--child"))
    {
        wchar_t dir[32768], value[256];
        GetCurrentDirectoryW(32768, dir);
        GetEnvironmentVariableW(L"YAAGL_FIXTURE_VALUE", value, 256);
        if (argc != 5 || wcscmp(argv[2], L"a quoted value") || *argv[3] || wcscmp(argv[4], L"日本語") ||
            wcscmp(value, L"inherited value")) return 90;
        /* An inherited Windows handle proves the existing server context. */
        wchar_t number[64];
        if (!GetEnvironmentVariableW(L"YAAGL_FIXTURE_HANDLE", number, 64)) return 91;
        DWORD written;
        if (!WriteFile((HANDLE)(ULONG_PTR)_wcstoui64(number, NULL, 10), "inherited", 9, &written, NULL) || written != 9) return 92;
        wprintf(L"child arguments/environment/handle retained; cwd=%ls\n", dir);
        return 37;
    }
    if (argc != 3) return 93;
    SECURITY_ATTRIBUTES sa = { sizeof(sa), NULL, TRUE };
    HANDLE output = CreateFileW(L"inherited.txt", GENERIC_WRITE, FILE_SHARE_READ, &sa, CREATE_ALWAYS, FILE_ATTRIBUTE_NORMAL, NULL);
    if (output == INVALID_HANDLE_VALUE) return 94;
    wchar_t number[64], command[512];
    swprintf(number, 64, L"%llu", (unsigned long long)(ULONG_PTR)output);
    SetEnvironmentVariableW(L"YAAGL_FIXTURE_HANDLE", number);
    SetEnvironmentVariableW(L"YAAGL_FIXTURE_VALUE", L"inherited value");
    swprintf(command, 512, L"\"%ls\" --child \"a quoted value\" \"\" \"日本語\"", argv[2]);
    STARTUPINFOW startup = { sizeof(startup) };
    PROCESS_INFORMATION process;
    if (!CreateProcessW(argv[1], command, NULL, NULL, TRUE, 0, NULL, NULL, &startup, &process))
    {
        fprintf(stderr, "CreateProcess failure %lu\n", GetLastError());
        return 95;
    }
    WaitForSingleObject(process.hProcess, INFINITE);
    DWORD exit_code;
    GetExitCodeProcess(process.hProcess, &exit_code);
    CloseHandle(process.hThread);
    CloseHandle(process.hProcess);
    CloseHandle(output);
    printf("child exit=%lu\n", exit_code);
    return exit_code == 37 ? 0 : 96;
}
