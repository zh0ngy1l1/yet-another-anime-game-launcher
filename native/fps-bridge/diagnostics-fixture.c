/* Harmless regression of the production logger. No child process is created.
 * Failure injection touches only logger writes to this fixture's own files. */
#define _WIN32_WINNT 0x0601
#ifndef UNICODE
#define UNICODE
#endif
#define _UNICODE
#include <windows.h>
#include <stdio.h>

static HANDLE fixture_log = INVALID_HANDLE_VALUE;
static unsigned fixture_failure, fixture_memory_writes;
static BOOL WINAPI fixture_write(HANDLE file, const void *data, DWORD size, DWORD *written, OVERLAPPED *overlapped) {
    if (file == fixture_log && fixture_failure == 1) { SetLastError(ERROR_DISK_FULL); return FALSE; }
    if (file == fixture_log && fixture_failure == 2 && size > 2) size = 2;
    return WriteFile(file, data, size, written, overlapped);
}
static BOOL WINAPI fixture_flush(HANDLE file) {
    if (file == fixture_log && fixture_failure == 3) { SetLastError(ERROR_WRITE_FAULT); return FALSE; }
    return FlushFileBuffers(file);
}
static BOOL WINAPI fixture_memory_write(HANDLE process, void *address, const void *data, SIZE_T size, SIZE_T *written) {
    (void)process; (void)address; (void)data; (void)size; (void)written;
    fixture_memory_writes++;
    SetLastError(ERROR_ACCESS_DENIED);
    return FALSE;
}
#define WriteFile fixture_write
#define FlushFileBuffers fixture_flush
#define WriteProcessMemory fixture_memory_write
#define FPS_BRIDGE_NO_GUI_ENTRY
#define wmain unused_bridge_entrypoint
#include "bridge.c"
#undef wmain
#undef WriteFile
#undef FlushFileBuffers
#undef WriteProcessMemory

static DWORD WINAPI write_lines(void *value) {
    unsigned id = (unsigned)(ULONG_PTR)value;
    for (unsigned i = 0; i < 20; i++) diagnostic("concurrent=%u line=%u end", id, i);
    return 0;
}

int wmain(int argc, wchar_t **argv) {
    if (argc != 2 || wcslen(argv[1]) > 32000) return 2;
    wchar_t output[32768], occupied[32768], fixture_token[65];
    swprintf(output, 32768, L"%ls\\occupied", argv[1]);
    swprintf(occupied, 32768, L"%ls.bridge.log", output);
    HANDLE existing = CreateFileW(occupied, GENERIC_WRITE, FILE_SHARE_READ, NULL, CREATE_NEW, FILE_ATTRIBUTE_NORMAL, NULL);
    if (existing == INVALID_HANDLE_VALUE) return 3;
    CloseHandle(existing);
    for (unsigned i = 0; i < 64; i++) fixture_token[i] = L'f';
    fixture_token[64] = 0;
    wchar_t *arguments[] = {L"fixture", argv[1], fixture_token, L"Z:\\never-create.exe", argv[1], L"", output};
    int exit = unused_bridge_entrypoint(7, arguments);
    if (exit != 3 || !diagnostic_failure() || game || shim || attempted || launched || job || steam_job) return 10;
    DeleteCriticalSection(&diagnostic_lock);
    InitializeCriticalSection(&diagnostic_lock);
    InterlockedExchange(&diagnostic_error, 0);
    swprintf(log_path, 32768, L"%ls\\concurrent", argv[1]);
    if (!open_diagnostics()) return 11;
    fixture_log = diagnostic_file;
    HANDLE threads[2] = {CreateThread(NULL, 0, write_lines, (void *)1, 0, NULL), CreateThread(NULL, 0, write_lines, (void *)2, 0, NULL)};
    if (!threads[0] || !threads[1] || WaitForMultipleObjects(2, threads, TRUE, INFINITE) != WAIT_OBJECT_0 || diagnostic_failure()) return 12;
    CloseHandle(threads[0]); CloseHandle(threads[1]);
    CloseHandle(diagnostic_file);
    swprintf(output, 32768, L"%ls.bridge.log", log_path);
    FILE *f = _wfopen(output, L"rb");
    if (!f) return 13;
    char line[1024]; unsigned count = 0;
    while (fgets(line, sizeof(line), f)) {
        unsigned id, number; char extra;
        char *body = strstr(line, " concurrent=");
        if (strncmp(line, "FPS ", 4) || !strstr(line, token) || !body ||
            sscanf(body, " concurrent=%u line=%u end %c", &id, &number, &extra) != 2 ||
            id < 1 || id > 2 || number >= 20 || line[strlen(line) - 1] != '\n') return 14;
        count++;
    }
    fclose(f);
    if (count != 40) return 15;
    for (fixture_failure = 1; fixture_failure <= 3; fixture_failure++) {
        swprintf(log_path, 32768, L"%ls\\failure-%u", argv[1], fixture_failure);
        InterlockedExchange(&diagnostic_error, 0);
        if (!open_diagnostics()) return 16;
        fixture_log = diagnostic_file;
        SetLastError(ERROR_BAD_FORMAT);
        diagnostic("injected failure %u", fixture_failure);
        DWORD expected = fixture_failure == 1 ? ERROR_DISK_FULL : ERROR_WRITE_FAULT;
        if (GetLastError() != ERROR_BAD_FORMAT || diagnostic_failure() != expected) return 17;
        if (!write_status(fixture_failure, 0)) return 18;
        game = GetCurrentProcess();
        if (apply_fps(NULL) != 1 || fixture_memory_writes || worker_state != 4 || (DWORD)worker_error != expected) return 19;
        game = NULL;
        CloseHandle(diagnostic_file);
    }
    DeleteCriticalSection(&diagnostic_lock);
    puts("PASS mandatory log before creation, serialized flushed records, write/short-write/flush failures observable, API error preserved, no FPS writes after log failure");
    return 0;
}
