/* Inert native C unit: no Windows libraries, Wine, child processes, files,
 * sockets, or GUI. Every Win32 API below is a local deterministic mock. */
#include <assert.h>
#include <stdint.h>
#include <stddef.h>
#include <stdio.h>
#include <stdarg.h>
#include <stdlib.h>
#include <string.h>

/* Expected mutation failures exit normally; never create crash reports. */
#undef assert
#define assert(condition) do { if (!(condition)) { \
    fprintf(stderr, "check failed at line %d: %s\n", __LINE__, #condition); exit(1); \
} } while (0)

typedef int BOOL;
typedef unsigned long DWORD;
typedef unsigned long long ULONGLONG;
typedef size_t SIZE_T;
typedef void *HANDLE;
typedef struct {
    void *BaseAddress, *AllocationBase;
    DWORD AllocationProtect;
    SIZE_T RegionSize;
    DWORD State, Protect, Type;
} MEMORY_BASIC_INFORMATION;
#define WAIT_FAILED 0xffffffffUL
#define WAIT_TIMEOUT 258UL
#define WAIT_OBJECT_0 0UL
#define ERROR_PARTIAL_COPY 299UL
#define ERROR_READ_FAULT 30UL
#define ERROR_WRITE_FAULT 29UL

static HANDLE game = (HANDLE)(uintptr_t)0x1234;
static DWORD game_pid = 280;
static unsigned generation = 1, target = 150;
static DWORD last_error, api_error, query_error, exit_error, wait_error;
static DWORD wait_result, exit_code;
static BOOL api_ok, query_ok, exit_ok;
static SIZE_T transferred;
static unsigned reads, writes, queries, waits, exits, logs;
static ULONGLONG tick;
static MEMORY_BASIC_INFORMATION mapping;
static char last_log[4096], all_logs[65536];

static DWORD GetLastError(void) { return last_error; }
static void SetLastError(DWORD error) { last_error = error; }
static BOOL ReadProcessMemory(HANDLE handle, void *address, void *buffer, SIZE_T length, SIZE_T *done) {
    assert(handle == game && (uintptr_t)address == 0x1452b4244ULL && length == 4);
    reads++;
    if (api_ok && transferred == 4) memcpy(buffer, &target, 4);
    *done = transferred;
    SetLastError(api_error);
    return api_ok;
}
static BOOL WriteProcessMemory(HANDLE handle, void *address, void *buffer, SIZE_T length, SIZE_T *done) {
    assert(handle == game && (uintptr_t)address == 0x1452b4244ULL && length == 4 && buffer);
    writes++;
    *done = transferred;
    SetLastError(api_error);
    return api_ok;
}
static DWORD WaitForSingleObject(HANDLE handle, DWORD timeout) {
    assert(handle == game && timeout == 0);
    waits++;
    SetLastError(wait_error);
    return wait_result;
}
static BOOL GetExitCodeProcess(HANDLE handle, DWORD *code) {
    assert(handle == game);
    exits++;
    *code = exit_code;
    SetLastError(exit_error);
    return exit_ok;
}
static SIZE_T VirtualQueryEx(HANDLE handle, void *address, MEMORY_BASIC_INFORMATION *info, SIZE_T size) {
    assert(handle == game && (uintptr_t)address == 0x1452b4244ULL && size == sizeof(*info));
    queries++;
    if (query_ok) *info = mapping;
    SetLastError(query_error);
    return query_ok ? sizeof(*info) : 0;
}
static ULONGLONG GetTickCount64(void) { return tick; }
static void diagnostic(const char *format, ...) {
    va_list args;
    va_start(args, format);
    int size = vsnprintf(last_log, sizeof(last_log), format, args);
    va_end(args);
    assert(size > 0 && (size_t)size < sizeof(last_log));
    assert(strlen(all_logs) + strlen(last_log) + 2 < sizeof(all_logs));
    strcat(all_logs, last_log);
    strcat(all_logs, "\n");
    logs++;
    /* Deliberately stronger than the production logger, which preserves it. */
    SetLastError(999);
}

#include "memory-diagnostics.c"

static void reset(void) {
    last_error = 87;
    api_ok = query_ok = exit_ok = 1;
    transferred = 4;
    api_error = 87; /* Undefined/stale on success, must not escape as failure. */
    query_error = 123;
    wait_error = 6;
    exit_error = 5;
    wait_result = WAIT_TIMEOUT;
    exit_code = 259;
    reads = writes = queries = waits = exits = logs = 0;
    tick = 1000;
    memset(&mapping, 0, sizeof(mapping));
    mapping.BaseAddress = (void *)(uintptr_t)0x1452b4000ULL;
    mapping.AllocationBase = (void *)(uintptr_t)0x140000000ULL;
    mapping.RegionSize = 4096;
    mapping.State = 0x1000;
    mapping.Protect = 8;
    mapping.AllocationProtect = 0x80;
    mapping.Type = 0x1000000;
    last_log[0] = all_logs[0] = 0;
}

int main(void) {
    for (int writing = 0; writing <= 1; writing++) {
        reset();
        unsigned value = 0;
        MemoryTransfer result = memory_transfer(0x1452b4244ULL, &value, 4, writing);
        assert(result.api_ok && result.transferred == 4 && !result.api_error && !result.error);
        assert(!GetLastError() && reads == (unsigned)!writing && writes == (unsigned)writing);
        assert(!queries && !waits && !exits); /* No per-poll probes on success. */

        reset();
        api_ok = 0; transferred = 0;
        query_ok = exit_ok = 0; wait_result = WAIT_FAILED;
        result = memory_transfer(0x1452b4244ULL, &value, 4, writing);
        assert(!result.api_ok && result.api_error == 87 && result.error == 87);
        assert(GetLastError() == 87 && queries == 1 && waits == 1 && exits == 1);
        assert(strstr(last_log, "apiError=87 error=87 wait=0xffffffff waitError=6 exitQueryOk=0 exitKnown=0"));
        assert(strstr(last_log, "exitError=5 queryBytes=0 queryError=123"));

        reset();
        api_ok = 0; transferred = 0; wait_result = 0; exit_code = 0xc0000005;
        result = memory_transfer(0x1452b4244ULL, &value, 4, writing);
        assert(result.error == 87 && GetLastError() == 87);
        assert(strstr(last_log, "wait=0x0 waitError=0 exitQueryOk=1 exitKnown=1 exitCode=0xc0000005"));
        assert(strstr(last_log, "state=0x1000 allocation=0x80 current=0x8"));

        reset();
        api_ok = 0; transferred = 0;
        result = memory_transfer(0x1452b4244ULL, &value, 4, writing);
        assert(result.error == 87 && GetLastError() == 87);
        assert(strstr(last_log, "wait=0x102 waitError=0 exitQueryOk=1 exitKnown=0 exitCode=0x00000103"));

        reset();
        transferred = 3;
        result = memory_transfer(0x1452b4244ULL, &value, 4, writing);
        assert(result.api_ok && result.transferred == 3 && result.api_error == 0);
        assert(result.error == ERROR_PARTIAL_COPY && GetLastError() == ERROR_PARTIAL_COPY);
        assert(strstr(last_log, "apiOk=1 transferred=3 apiError=0 error=299"));

        reset();
        api_ok = 0; api_error = 0; transferred = 0;
        result = memory_transfer(0x1452b4244ULL, &value, 4, writing);
        assert(result.api_error == 0 && result.error == (writing ? ERROR_WRITE_FAULT : ERROR_READ_FAULT));
        assert(GetLastError() == result.error);
    }

    reset();
    MemoryCounters counts = {0};
    counts.reads = counts.read_ok = 25;
    counts.writes = counts.write_ok = 2;
    counts.equal = 23;
    memory_heartbeat(&counts, 0x1452b4244ULL, 0);
    assert(logs == 1 && queries == 1 && counts.sampled && !counts.mapping_changes && GetLastError() == 87);
    assert(strstr(last_log, "reads=25 readOk=25 writes=2 writeOk=2 equal=23"));
    tick = 5999;
    memory_heartbeat(&counts, 0x1452b4244ULL, 0);
    assert(logs == 1 && queries == 1 && GetLastError() == 87);
    tick = 6000;
    memory_heartbeat(&counts, 0x1452b4244ULL, 0);
    assert(logs == 2 && queries == 2 && !counts.mapping_changes);
    tick = 11000; mapping.Protect = 1;
    memory_heartbeat(&counts, 0x1452b4244ULL, 0);
    assert(counts.mapping_changes == 1 && strstr(last_log, "current=0x1"));
    tick = 16000; mapping.Protect = 8;
    memory_heartbeat(&counts, 0x1452b4244ULL, 0);
    assert(counts.mapping_changes == 2 && strstr(last_log, "current=0x8"));
    tick = 21000; query_ok = 0;
    memory_heartbeat(&counts, 0x1452b4244ULL, 0);
    assert(counts.mapping_changes == 3 && strstr(last_log, "queryBytes=0 queryError=123"));
    tick = 26000;
    memory_heartbeat(&counts, 0x1452b4244ULL, 0);
    assert(counts.mapping_changes == 3 && GetLastError() == 87);
    tick = 26001;
    memory_heartbeat(&counts, 0x1452b4244ULL, 1);
    assert(logs == 7 && queries == 7 && strstr(last_log, "final=1"));
    assert(!reads && !writes && !waits && !exits && GetLastError() == 87);
    puts("PASS exact memory helper: immediate error capture, successful-short normalization, read/write failure probes preserve original error, retained-handle exit observation, bounded heartbeat counters and mapping changes; all APIs inert mocks");
    return 0;
}
