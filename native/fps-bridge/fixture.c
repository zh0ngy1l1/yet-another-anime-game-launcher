/* Harmless test executable. Only its own integer is a writable FPS fixture.
 * It never enumerates, attaches to, or modifies another process. */
#include <windows.h>
#include <winternl.h>
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
    wchar_t startup_path[32768], startup_tmp[32768];
    swprintf(startup_path, 32768, L"%ls\\%ls-startup", directory, child ? L"child" : L"root");
    swprintf(startup_tmp, 32768, L"%ls.tmp", startup_path);
    FILE *startup = _wfopen(startup_tmp, L"w");
    if (!startup) return 4;
    typedef NTSTATUS (WINAPI *Query)(HANDLE, PROCESSINFOCLASS, void *, ULONG, ULONG *);
    Query query = (Query)(void *)GetProcAddress(GetModuleHandleW(L"ntdll.dll"), "NtQueryInformationProcess");
    PROCESS_BASIC_INFORMATION info;
    if (!query || query(GetCurrentProcess(), ProcessBasicInformation, &info, sizeof(info), NULL)) return 5;
    wchar_t parent_image[32768] = {0};
    HANDLE parent = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, (DWORD)info.InheritedFromUniqueProcessId);
    DWORD parent_length = 32768;
    if (parent) {
        QueryFullProcessImageNameW(parent, 0, parent_image, &parent_length);
        CloseHandle(parent);
    }
    wchar_t cwd[32768], keep[128] = {0}, dxmt[32768] = {0};
    GetCurrentDirectoryW(32768, cwd); GetEnvironmentVariableW(L"KEEP", keep, 128);
    GetEnvironmentVariableW(L"DXMT_CONFIG", dxmt, 32768);
    fwprintf(startup, L"pid=%lu\nparent=%llu\nparentImage=%ls\nargc=%d\ncommand=%ls\ncwd=%ls\nKEEP=%ls\nDXMT_CONFIG=%ls\n",
        GetCurrentProcessId(), (unsigned long long)info.InheritedFromUniqueProcessId, parent_image, argc, GetCommandLineW(), cwd, keep, dxmt);
    fclose(startup);
    if (!MoveFileExW(startup_tmp, startup_path, MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH)) return 6;
    puts("harmless fixture stdout"); fflush(stdout);
    fputs("harmless fixture stderr\n", stderr); fflush(stderr);
    wchar_t exit_code[32];
    if (GetEnvironmentVariableW(L"FPS_FIXTURE_EXIT_CODE", exit_code, 32))
        ExitProcess(wcstoul(exit_code, NULL, 0)); /* Simulated abnormal exit, no crash handler/debugger. */
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
        wchar_t temporary[32768]; swprintf(temporary, 32768, L"%ls.tmp", output);
        FILE *f = _wfopen(temporary, L"w");
        if (f) {
            wchar_t dxmt[32768]; GetEnvironmentVariableW(L"DXMT_CONFIG", dxmt, 32768);
            fwprintf(f, L"%lu %d %ls\n", GetCurrentProcessId(), fixture_fps, dxmt);
            fclose(f);
            if (!MoveFileExW(temporary, output, MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH)) return 7;
        }
        Sleep(50);
    }
    return 0;
}
