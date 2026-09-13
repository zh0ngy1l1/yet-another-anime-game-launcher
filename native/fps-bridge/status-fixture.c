/* Harmless deterministic regression. No bridge entrypoint or child creation is
 * called. Only production status observation runs; output uses the supplied
 * isolated fixture directory. */
#define _WIN32_WINNT 0x0601
#ifndef UNICODE
#define UNICODE
#endif
#define _UNICODE
#include <windows.h>
#include <stdio.h>

static const HANDLE fixture_game = (HANDLE)(ULONG_PTR)0x70000004;
static const HANDLE fixture_shim = (HANDLE)(ULONG_PTR)0x70000008;
static unsigned fixture_mode, fixture_game_polls;

static DWORD WINAPI fixture_wait(HANDLE handle, DWORD timeout) {
    if (handle == fixture_game) {
        fixture_game_polls++;
        if (fixture_mode == 1 || (!fixture_mode && fixture_game_polls == 1)) return WAIT_TIMEOUT;
        return WAIT_OBJECT_0;
    }
    if (handle == fixture_shim) return WAIT_OBJECT_0;
    return WaitForSingleObject(handle, timeout);
}

static BOOL WINAPI fixture_exit_code(HANDLE handle, DWORD *code) {
    if (handle == fixture_game || handle == fixture_shim) {
        *code = !fixture_mode ? 0xc0000005 : handle == fixture_shim ? 42 : 0;
        return TRUE;
    }
    return GetExitCodeProcess(handle, code);
}

#define WaitForSingleObject fixture_wait
#define GetExitCodeProcess fixture_exit_code
#define FPS_BRIDGE_NO_GUI_ENTRY
#define wmain unused_bridge_entrypoint
#ifndef FPS_STATUS_BRIDGE_SOURCE
#define FPS_STATUS_BRIDGE_SOURCE "bridge.c"
#endif
#include FPS_STATUS_BRIDGE_SOURCE
#undef wmain
#undef WaitForSingleObject
#undef GetExitCodeProcess

int wmain(int argc, wchar_t **argv) {
    if (argc != 2 || wcslen(argv[1]) >= 32768) return 2;
    wcscpy(directory, argv[1]);
    memset(token, 'f', 64);
    token[64] = 0;
    InitializeCriticalSection(&diagnostic_lock);
    swprintf(log_path, 32768, L"%ls\\status", directory);
    if (!open_diagnostics()) return 13;
    game = fixture_game;
    shim = fixture_shim;
    game_pid = 4242;
    shim_pid = 4240;
    launched = 1;
    steam_acknowledged = 1;
    for (fixture_mode = 0; fixture_mode < 3; fixture_mode++) {
        fixture_game_polls = 0;
        primary_exited = 0;
        game_exit_known = 0;
        game_exit_code = game_exit_error = 0;
        shim_exited = 0;
        steam_error = 0;
        if (!write_status(fixture_mode + 1, 0)) return 3;
        if (!fixture_mode) {
            if (!primary_exited || !game_exit_known || game_exit_code != 0xc0000005 || steam_error || fixture_game_polls != 2) {
                fprintf(stderr, "FAIL child exited between polls: exited=%d known=%d code=%lu steamError=%lu polls=%u\n",
                    primary_exited, game_exit_known, game_exit_code, steam_error, fixture_game_polls);
                return 10;
            }
        } else if (fixture_mode == 1) {
            if (primary_exited || game_exit_known || steam_error != 42) return 11;
        } else if (!primary_exited || !game_exit_known || game_exit_code || steam_error != 42) return 12;
    }
    CloseHandle(diagnostic_file);
    DeleteCriticalSection(&diagnostic_lock);
    puts("PASS status child-exit-between-polls, true early shim exit, and distinct shim error");
    return 0;
}
