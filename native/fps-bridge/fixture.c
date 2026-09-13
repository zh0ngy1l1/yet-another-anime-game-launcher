/* Harmless test executable. Only its own integer is a writable FPS fixture.
 * It never enumerates, attaches to, or modifies another process. */
#include <windows.h>
#include <winternl.h>
#include <stdio.h>
#include <stdlib.h>
#include <wchar.h>

/* Test oracle only: a real direct Steam child is the process object retained
 * by the unchanged signed shim. Inspect only that parent's handles, duplicate
 * before querying, and never use a snapshot PID as a process identity. */
typedef struct {
    void *object;
    ULONG_PTR pid, handle;
    ULONG access;
    USHORT backtrace, type;
    ULONG attributes, reserved;
} FixtureHandleEntry;
typedef struct {
    ULONG_PTR count, reserved;
    FixtureHandleEntry entries[1];
} FixtureHandleTable;

static int parent_retains_self(DWORD parent_pid) {
    typedef NTSTATUS (WINAPI *Query)(ULONG, void *, ULONG, ULONG *);
    Query query = (Query)(void *)GetProcAddress(GetModuleHandleW(L"ntdll.dll"), "NtQuerySystemInformation");
    HANDLE parent = OpenProcess(PROCESS_DUP_HANDLE, FALSE, parent_pid);
    if (!query || !parent) { if (parent) CloseHandle(parent); return -1; }
    ULONG size = 65536, needed = 0;
    FixtureHandleTable *table = NULL;
    NTSTATUS status = (NTSTATUS)0xc0000004;
    for (unsigned attempt = 0; attempt < 8 && status == (NTSTATUS)0xc0000004; attempt++) {
        free(table);
        table = malloc(size);
        if (!table) break;
        status = query(64, table, size, &needed);
        if (status == (NTSTATUS)0xc0000004) {
            if (needed > 16 * 1024 * 1024 || size > 8 * 1024 * 1024) break;
            size = needed > size ? needed + 4096 : size * 2;
        }
    }
    int found = -1;
    if (!status && table && table->count <= (size - sizeof(ULONG_PTR) * 2) / sizeof(FixtureHandleEntry)) {
        found = 0;
        for (ULONG_PTR i = 0; i < table->count; i++) {
            FixtureHandleEntry *entry = &table->entries[i];
            if (entry->pid != parent_pid) continue;
            HANDLE copied;
            if (!DuplicateHandle(parent, (HANDLE)entry->handle, GetCurrentProcess(), &copied,
                0, FALSE, DUPLICATE_SAME_ACCESS)) continue;
            if (GetProcessId(copied) == GetCurrentProcessId()) found = 1;
            CloseHandle(copied);
        }
    }
    free(table);
    CloseHandle(parent);
    return found;
}
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
    fwprintf(startup, L"parentRetainsSelfProcessHandle=%d\n", parent_retains_self((DWORD)info.InheritedFromUniqueProcessId));
    fclose(startup);
    if (!MoveFileExW(startup_tmp, startup_path, MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH)) return 6;
    puts("harmless fixture stdout"); fflush(stdout);
    fputs("harmless fixture stderr\n", stderr); fflush(stderr);
    wchar_t exit_code[32];
    if (GetEnvironmentVariableW(L"FPS_FIXTURE_EXIT_CODE", exit_code, 32))
        ExitProcess(wcstoul(exit_code, NULL, 0)); /* Simulated abnormal exit, no crash handler/debugger. */
    swprintf(stop, 32768, L"%ls\\%ls-stop", directory, child ? L"child" : L"root");
    swprintf(output, 32768, L"%ls\\%ls-observed", directory, child ? L"child" : L"root");
    wchar_t detach[2], gate[2], create[32768];
    int child_created = 0;
    wchar_t window_flag[2], window_gate[32768], window_ready[32768];
    int want_window = !child && GetEnvironmentVariableW(L"FPS_FIXTURE_WINDOW", window_flag, 2) && window_flag[0] == L'1';
    HWND fixture_window = NULL;
    swprintf(window_gate, 32768, L"%ls\\window-create", directory);
    swprintf(window_ready, 32768, L"%ls\\window-ready", directory);
    int want_child = !child && GetEnvironmentVariableW(L"FPS_FIXTURE_DETACH", detach, 2) && detach[0] == L'1';
    int child_gate = GetEnvironmentVariableW(L"FPS_FIXTURE_CHILD_GATE", gate, 2) && gate[0] == L'1';
    swprintf(create, 32768, L"%ls\\child-create", directory);
    while (GetFileAttributesW(stop) == INVALID_FILE_ATTRIBUTES) {
        /* A real window exercises Wine's lazy explorer desktop creation. The
         * controller opens this fixture-only gate after target admission. */
        if (want_window && !fixture_window && GetFileAttributesW(window_gate) != INVALID_FILE_ATTRIBUTES) {
            fixture_window = CreateWindowExW(0, L"STATIC", L"YAAGL harmless FPS window fixture",
                WS_OVERLAPPEDWINDOW, 0, 0, 160, 80, NULL, NULL, GetModuleHandleW(NULL), NULL);
            if (!fixture_window) return 8;
            FILE *ready = _wfopen(window_ready, L"w");
            if (!ready) return 9;
            fwprintf(ready, L"pid=%lu hwnd=0x%llx\n", GetCurrentProcessId(), (unsigned long long)(uintptr_t)fixture_window);
            fclose(ready);
        }
        MSG message;
        while (fixture_window && PeekMessageW(&message, NULL, 0, 0, PM_REMOVE)) {
            TranslateMessage(&message);
            DispatchMessageW(&message);
        }
        /* This gate controls only fixture descendants. The root keeps running
         * and reporting FPS before the controller authorizes the child. */
        if (want_child && !child_created && (!child_gate || GetFileAttributesW(create) != INVALID_FILE_ATTRIBUTES)) {
            wchar_t command[32768], own[32768];
            GetModuleFileNameW(NULL, own, 32768);
            swprintf(command, 32768, L"\"%ls\" child", own);
            STARTUPINFOW si = {0}; PROCESS_INFORMATION pi = {0}; si.cb = sizeof(si);
            if (!CreateProcessW(own, command, NULL, NULL, FALSE, DETACHED_PROCESS, NULL, NULL, &si, &pi)) return 3;
            CloseHandle(pi.hProcess); CloseHandle(pi.hThread);
            child_created = 1;
        }
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
    if (fixture_window) DestroyWindow(fixture_window);
    return 0;
}

#ifdef FPS_FIXTURE_GUI
int WINAPI wWinMain(HINSTANCE instance, HINSTANCE previous, wchar_t *command, int show) {
    (void)instance; (void)previous; (void)command; (void)show;
    return wmain(__argc, __wargv);
}
#endif
