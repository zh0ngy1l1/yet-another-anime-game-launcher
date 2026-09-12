/* Harmless fault shim for native boundary tests, NEVER a shipped resource.
 * Normal compatibility/parent tests use the unchanged signed steam64.exe. */
#define _WIN32_WINNT 0x0601
#ifndef UNICODE
#define UNICODE
#endif
#define _UNICODE
#include <windows.h>
#include <winternl.h>
#include <stdio.h>
#include <wchar.h>

int wmain(int argc, wchar_t **argv) {
    if (argc != 4 || wcscmp(argv[2], L"--steam-relay") || wcslen(argv[3]) != 64) return 10;
    wchar_t mode[64], directory[32768], stop[32768];
    GetEnvironmentVariableW(L"FPS_STEAM_FIXTURE_MODE", mode, 64);
    GetEnvironmentVariableW(L"FPS_FIXTURE_DIRECTORY", directory, 32768);
    swprintf(stop, 32768, L"%ls\\steam-stop", directory);
    if (!wcscmp(mode, L"before-create")) return 11;
    if (!wcscmp(mode, L"missing")) {
        while (GetFileAttributesW(stop) == INVALID_FILE_ATTRIBUTES) Sleep(20);
        return 0;
    }
    if (!wcscmp(mode, L"late")) Sleep(10500);
    if (!wcscmp(mode, L"mismatch")) argv[3][0] = argv[3][0] == L'a' ? L'b' : L'a';
    if (!wcscmp(mode, L"protocol")) {
        wchar_t name[128]; swprintf(name, 128, L"Local\\YAAGL.FPS.%ls.map", argv[3]);
        HANDLE mapping = OpenFileMappingW(FILE_MAP_ALL_ACCESS, FALSE, name);
        DWORD *slot = mapping ? MapViewOfFile(mapping, FILE_MAP_ALL_ACCESS, 0, 0, 8) : NULL;
        if (!slot) return 12;
        slot[1] = 999;
        UnmapViewOfFile(slot); CloseHandle(mapping);
    }
    wchar_t command[32768];
    swprintf(command, 32768, L"\"%ls\" --steam-relay %ls", argv[1], argv[3]);
    STARTUPINFOW si = {0}; PROCESS_INFORMATION pi = {0}; si.cb = sizeof(si);
    if (!CreateProcessW(argv[1], command, NULL, NULL, FALSE, 0, NULL, NULL, &si, &pi)) return 13;
    CloseHandle(pi.hThread);
    if (!wcscmp(mode, L"early")) {
        while (GetFileAttributesW(stop) == INVALID_FILE_ATTRIBUTES) Sleep(20);
    } else {
        if (!wcscmp(mode, L"after-handoff")) {
            while (GetFileAttributesW(stop) == INVALID_FILE_ATTRIBUTES) Sleep(20);
            wchar_t name[128]; swprintf(name, 128, L"Local\\YAAGL.FPS.%ls.map", argv[3]);
            HANDLE mapping = OpenFileMappingW(FILE_MAP_ALL_ACCESS, FALSE, name);
            DWORD *slot = mapping ? MapViewOfFile(mapping, FILE_MAP_ALL_ACCESS, 0, 0, 8) : NULL;
            if (!slot) return 14;
            slot[1] = 999; UnmapViewOfFile(slot); CloseHandle(mapping);
        }
        WaitForSingleObject(pi.hProcess, INFINITE);
    }
    DWORD code = 0;
    if (wcscmp(mode, L"early")) GetExitCodeProcess(pi.hProcess, &code);
    CloseHandle(pi.hProcess);
    return (int)code;
}
