/* Harmless test executable. Only its own integer is a writable FPS fixture.
 * It never enumerates, attaches to, or modifies another process. */
#include <windows.h>
#include <stdio.h>
#include <wchar.h>
volatile int fixture_fps = 60;
#ifdef FPS_FIXTURE_AMBIGUOUS
volatile int fixture_second = 60;
__asm__(".section il2cpp,\"xr\"\n"
        "mov $60, %ecx\ncall fixture_second_jump\nret\n"
        "fixture_second_jump:\n.byte 0xe9\n.long fixture_second_set - . - 4\n"
        "fixture_second_set:\nmov %ecx, fixture_second(%rip)\nret\n.text\n");
#endif
#ifndef FPS_FIXTURE_NO_PATTERN
__asm__(".section il2cpp,\"xr\"\n"
        "mov $60, %ecx\n"
        "call fixture_jump\n"
        "ret\n"
        "fixture_jump:\n"
        ".byte 0xe9\n.long fixture_set - . - 4\n"
        "fixture_set:\n"
        "mov %ecx, fixture_fps(%rip)\n"
        "ret\n"
        ".text\n");
#endif
int wmain(int argc, wchar_t **argv) {
    wchar_t directory[32768], stop[32768], output[32768];
    if (!GetEnvironmentVariableW(L"FPS_FIXTURE_DIRECTORY", directory, 32768)) return 2;
    int child = argc == 2 && !wcscmp(argv[1], L"child");
    swprintf(stop, 32768, L"%ls\\%ls-stop", directory, child ? L"child" : L"root");
    swprintf(output, 32768, L"%ls\\%ls-observed", directory, child ? L"child" : L"root");
    wchar_t detach[2];
    if (!child && GetEnvironmentVariableW(L"FPS_FIXTURE_DETACH", detach, 2) && detach[0] == L'1') {
        wchar_t command[32768], own[32768];
        GetModuleFileNameW(NULL, own, 32768);
        swprintf(command, 32768, L"\"%ls\" child", own);
        STARTUPINFOW si = {0}; PROCESS_INFORMATION pi = {0}; si.cb = sizeof(si);
        if (!CreateProcessW(own, command, NULL, NULL, FALSE, DETACHED_PROCESS, NULL, NULL, &si, &pi)) return 3;
        CloseHandle(pi.hProcess); CloseHandle(pi.hThread);
    }
    while (GetFileAttributesW(stop) == INVALID_FILE_ATTRIBUTES) {
        FILE *f = _wfopen(output, L"w");
        if (f) {
            wchar_t dxmt[32768]; GetEnvironmentVariableW(L"DXMT_CONFIG", dxmt, 32768);
            fwprintf(f, L"%lu %d %ls\n", GetCurrentProcessId(), fixture_fps, dxmt);
            fclose(f);
        }
        Sleep(50);
    }
    return 0;
}
