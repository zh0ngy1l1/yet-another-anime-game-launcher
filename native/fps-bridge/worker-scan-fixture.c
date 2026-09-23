/* Run the actual PE scanner and worker against this harmless fixture's image.
 * Deterministically fail each read; lifecycle waits are injected, never kills. */
#define _WIN32_WINNT 0x0601
#ifndef UNICODE
#define UNICODE
#endif
#define _UNICODE
#include <windows.h>
#include <stdio.h>
static HANDLE fixture_game, fixture_stop;
static unsigned read_number, fail_read, fail_write, lifecycle;
static int failure_seen;
static void race(void) {
    failure_seen = 1;
    if (lifecycle == 2) SetEvent(fixture_stop);
}
static BOOL WINAPI fixture_read(HANDLE process, const void *address, void *buffer, SIZE_T size, SIZE_T *done) {
    if (++read_number == fail_read) {
        race(); *done = 0; SetLastError(ERROR_INVALID_PARAMETER); return FALSE;
    }
    return ReadProcessMemory(process, address, buffer, size, done);
}
static BOOL WINAPI fixture_write(HANDLE process, void *address, const void *buffer, SIZE_T size, SIZE_T *done) {
    if (fail_write) { race(); *done = 0; SetLastError(ERROR_INVALID_PARAMETER); return FALSE; }
    return WriteProcessMemory(process, address, buffer, size, done);
}
static DWORD WINAPI fixture_wait(HANDLE handle, DWORD timeout) {
    if (handle == fixture_game && failure_seen && lifecycle == 1) return WAIT_OBJECT_0;
    return WaitForSingleObject(handle, timeout);
}
#define ReadProcessMemory fixture_read
#define WriteProcessMemory fixture_write
#define WaitForSingleObject fixture_wait
#define FPS_BRIDGE_NO_GUI_ENTRY
#define wmain unused_bridge_entrypoint
#include "bridge.c"
#undef wmain
#undef ReadProcessMemory
#undef WriteProcessMemory
#undef WaitForSingleObject
volatile int fixture_fps = 60;
__asm__(".section il2cpp,\"xr\"\n"
        "mov $60, %ecx\ncall fixture_jump\nret\n"
        "fixture_jump:\n.byte 0xe9\n.long fixture_set - . - 4\n"
        "fixture_set:\nmov %ecx, fixture_fps(%rip)\nret\n.text\n");
int wmain(int argc, wchar_t **argv) {
    if (argc != 2) return 2;
    InitializeCriticalSection(&diagnostic_lock);
    swprintf(log_path, 32768, L"%ls\\scan", argv[1]);
    if (!open_diagnostics()) return 3;
    if (!DuplicateHandle(GetCurrentProcess(), GetCurrentProcess(), GetCurrentProcess(), &game, 0, FALSE, DUPLICATE_SAME_ACCESS)) return 4;
    fixture_game = game; game_pid = GetCurrentProcessId(); target = 150; generation = 1;
    worker_stop = fixture_stop = CreateEventW(NULL, TRUE, FALSE, NULL);
    if (!worker_stop || fps_address() != (uintptr_t)&fixture_fps) return 5;
    unsigned scan_reads = read_number;
    if (scan_reads < 6) return 6;
    for (lifecycle = 0; lifecycle < 3; lifecycle++) {
        /* Header, section, signature chunk and E8/E9/candidate reads, then
         * recurring read and write. All pass through production apply_fps. */
        for (unsigned operation = 1; operation <= scan_reads + 2; operation++) {
            read_number = 0; failure_seen = 0; fixture_fps = 60;
            ResetEvent(worker_stop); worker_error = 0; worker_state = 1;
            fail_read = operation <= scan_reads + 1 ? operation : 0;
            fail_write = operation == scan_reads + 2;
            DWORD result = apply_fps(NULL);
            if (!failure_seen || result != (lifecycle ? 0u : 1u) ||
                worker_state != (lifecycle ? 3 : 4) ||
                worker_error != (lifecycle ? 0 : operation <= scan_reads ? ERROR_NOT_FOUND : 87)) return 7;
        }
    }
    printf("PASS actual scanner: %u PE/header/section/signature/candidate reads, recurring read/write; live failures retained, exit/stop races clean\n", scan_reads);
    CloseHandle(worker_stop); CloseHandle(game); CloseHandle(diagnostic_file);
    DeleteCriticalSection(&diagnostic_lock);
    return 0;
}
