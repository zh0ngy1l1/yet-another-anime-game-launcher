/* Harmless fault shim for native boundary tests, NEVER a shipped resource.
 * Normal compatibility/parent tests use the unchanged signed steam64.exe. */
#define _WIN32_WINNT 0x0601
#ifndef UNICODE
#define UNICODE
#endif
#define _UNICODE
#include <windows.h>
#include <stdio.h>
#include <wchar.h>

static int create(const wchar_t *image, PROCESS_INFORMATION *process) {
    wchar_t command[32768];
    if (swprintf(command, 32768, L"\"%ls\"", image) < 0) return 0;
    STARTUPINFOW startup = {0}; startup.cb = sizeof(startup);
    if (!CreateProcessW(NULL, command, NULL, NULL, FALSE, CREATE_UNICODE_ENVIRONMENT,
        NULL, NULL, &startup, process)) return 0;
    CloseHandle(process->hThread);
    return 1;
}

int wmain(int argc, wchar_t **argv) {
    if (argc != 2) return 10;
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
    PROCESS_INFORMATION process = {0}, decoy = {0};
    wchar_t wrong[32768];
    GetEnvironmentVariableW(L"FPS_STEAM_FIXTURE_WRONG_IMAGE", wrong, 32768);
    if (!wcscmp(mode, L"eager")) {
        wchar_t decoy_directory[32768];
        swprintf(decoy_directory, 32768, L"%ls\\decoy", directory);
        SetEnvironmentVariableW(L"FPS_FIXTURE_DIRECTORY", decoy_directory);
        if (!create(wrong, &decoy)) return 12;
        SetEnvironmentVariableW(L"FPS_FIXTURE_DIRECTORY", directory);
    }
    if (!create(!wcscmp(mode, L"wrong-image") ? wrong : argv[1], &process)) return 13;
    if (!wcscmp(mode, L"early") || !wcscmp(mode, L"drop-handle")) {
        while (GetFileAttributesW(stop) == INVALID_FILE_ATTRIBUTES) Sleep(20);
        CloseHandle(process.hProcess);
        if (!wcscmp(mode, L"early")) return 0;
        swprintf(stop, 32768, L"%ls\\steam-exit-stop", directory);
        while (GetFileAttributesW(stop) == INVALID_FILE_ATTRIBUTES) Sleep(20);
        return 0;
    }
    WaitForSingleObject(process.hProcess, INFINITE);
    DWORD code = 0;
    GetExitCodeProcess(process.hProcess, &code);
    CloseHandle(process.hProcess);
    if (decoy.hProcess) {
        WaitForSingleObject(decoy.hProcess, INFINITE);
        CloseHandle(decoy.hProcess);
    }
    return (int)code;
}
