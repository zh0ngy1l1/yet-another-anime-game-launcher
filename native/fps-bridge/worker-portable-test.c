/* Deterministic scheduling of the production worker. No Wine or processes. */
#include <stdint.h>
#include <stddef.h>
#include <stdio.h>
#include <stdlib.h>
#include <stdarg.h>
#define CHECK(c) do { if (!(c)) { fprintf(stderr, "line %d: %s\n", __LINE__, #c); exit(1); } } while (0)
typedef unsigned long DWORD;
typedef int32_t LONG;
typedef size_t SIZE_T;
typedef void *HANDLE;
typedef struct { int unused; } MEMORY_BASIC_INFORMATION;
#define WINAPI
#define FALSE 0
#define WAIT_TIMEOUT 258
#define WAIT_OBJECT_0 0
#define WAIT_FAILED 0xffffffffUL
#define ERROR_NOT_FOUND 1168
static HANDLE game = (HANDLE)1, worker_stop = (HANDLE)2;
static LONG worker_state, worker_error;
static unsigned generation = 1, target = 150;
static DWORD game_pid = 280;
static int stop, exited, scan_failed, fail_write, query_terminating, probe_terminating;
static int race, transfers, read_count, write_count;
static DWORD diagnostic_error;
static DWORD diagnostic_failure(void) { return diagnostic_error; }
static void diagnostic(const char *format, ...) { (void)format; }
static LONG InterlockedExchange(LONG *at, LONG value) { LONG old = *at; *at = value; return old; }
static LONG InterlockedCompareExchange(LONG *at, LONG value, LONG expected) { LONG old = *at; if (old == expected) *at = value; return old; }
static DWORD GetLastError(void) { return 6; }
static DWORD WaitForSingleObject(HANDLE handle, DWORD timeout) {
    CHECK(!timeout && (handle == game || handle == worker_stop));
    return (handle == game ? exited : stop) ? WAIT_OBJECT_0 : WAIT_TIMEOUT;
}
static DWORD WaitForMultipleObjects(DWORD count, HANDLE *handles, int all, DWORD timeout) {
    CHECK(count == 2 && handles[0] == worker_stop && handles[1] == game && !all);
    if (stop) return 0;
    if (exited) return 1;
    CHECK(!timeout); /* Every scenario ends on its deliberately failed operation. */
    return WAIT_TIMEOUT;
}
static LONG query_memory_status(uintptr_t address, MEMORY_BASIC_INFORMATION *info, SIZE_T *bytes) {
    (void)address; (void)info; *bytes = 0;
    return query_terminating ? (LONG)0xc000010a : (LONG)0xc0000022; /* ACCESS_DENIED is not termination. */
}
static void schedule_race(void) {
    if (race == 1) exited = 1;
    if (race == 2) stop = 1;
}
static uintptr_t fps_address(void) {
    if (scan_failed) { schedule_race(); return 0; }
    return 0x1234;
}
typedef struct { DWORD error; int terminating; } MemoryTransfer;
typedef struct { unsigned reads, read_ok, writes, write_ok, equal; } MemoryCounters;
static MemoryTransfer memory_transfer(uintptr_t address, void *value, SIZE_T size, int writing) {
    CHECK(address == 0x1234 && size == 4);
    transfers++;
    if (writing) write_count++; else read_count++;
    if (fail_write && !writing) { *(int *)value = 60; return (MemoryTransfer){0}; }
    schedule_race();
    return (MemoryTransfer){87, probe_terminating};
}
static void memory_heartbeat(MemoryCounters *counts, uintptr_t address, int final) {
    (void)counts; (void)address; (void)final;
}
#include "worker.c"
int main(void) {
    for (int scanning = 0; scanning < 2; scanning++)
    for (int writing = 0; writing < 2; writing++)
    for (int lifecycle = 0; lifecycle < 5; lifecycle++) {
        stop = exited = transfers = read_count = write_count = 0;
        worker_state = 1; worker_error = 0;
        scan_failed = scanning; fail_write = writing;
        race = lifecycle; query_terminating = lifecycle == 3;
        probe_terminating = lifecycle == 4;
        if (scanning && probe_terminating) query_terminating = 1;
        DWORD result = apply_fps(NULL);
        CHECK(result == (DWORD)(lifecycle == 0));
        CHECK(worker_state == (lifecycle ? 3 : 4));
        CHECK(worker_error == (lifecycle ? 0 : scanning ? ERROR_NOT_FOUND : 87));
        CHECK(read_count == !scanning && write_count == (!scanning && writing));
    }
    stop = 1; diagnostic_error = 29; worker_error = 0;
    CHECK(worker_failure(87, 0, 1, "read") && worker_state == 4 && worker_error == 29);
    puts("PASS production worker: live read/write 87, scan miss, exit/stop races, pre-signal NT termination, ordinary access-denied remains failure, diagnostics failure retained");
}
