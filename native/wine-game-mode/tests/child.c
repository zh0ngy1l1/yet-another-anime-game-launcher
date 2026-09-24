/* Bounded routing fixture; never opens or modifies game data. */
#include <windows.h>
#include <stdio.h>
#include <wchar.h>

int wmain(int argc, wchar_t **argv)
{
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
