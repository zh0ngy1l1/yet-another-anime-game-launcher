/* Only retained-HANDLE observations can turn an operation failure into a
 * normal worker end. A later successful game exit cannot erase a live failure.
 * The NT query covers Wine teardown before its process HANDLE is signaled. */
static int worker_failure(DWORD error, uintptr_t address, int terminating, const char *phase) {
    DWORD stop_wait = WaitForSingleObject(worker_stop, 0);
    DWORD game_wait = WaitForSingleObject(game, 0);
    LONG status = terminating ? (LONG)0xc000010a : 0;
    if (!terminating && stop_wait != WAIT_OBJECT_0 && game_wait != WAIT_OBJECT_0) {
        MEMORY_BASIC_INFORMATION info = {0};
        SIZE_T bytes = 0;
        status = query_memory_status(address, &info, &bytes);
        terminating = status == (LONG)0xc000010a; /* STATUS_PROCESS_IS_TERMINATING */
    }
    int ended = stop_wait == WAIT_OBJECT_0 || game_wait == WAIT_OBJECT_0 || terminating;
    /* Durable-log failure is independent of game lifetime. */
    DWORD log_error = diagnostic_failure();
    diagnostic("worker failure classification generation=%u phase=%s originalError=%lu stopWait=0x%lx gameWait=0x%lx queryStatus=0x%08lx terminating=%d reason=%s",
        generation, phase, error, stop_wait, game_wait, (unsigned long)(DWORD)status, terminating,
        log_error ? "diagnostic-failure" : !ended ? "live-target-failure" :
        stop_wait == WAIT_OBJECT_0 ? "stop-request" : game_wait == WAIT_OBJECT_0 ? "game-exit" : "process-terminating");
    if (!log_error) log_error = diagnostic_failure();
    InterlockedExchange(&worker_error, (LONG)(log_error ? log_error : ended ? 0 : error));
    InterlockedExchange(&worker_state, ended && !log_error ? 3 : 4);
    return !ended || log_error;
}

static DWORD WINAPI apply_fps(void *unused) {
    (void)unused;
    diagnostic("worker scanning generation=%u game=%lu target=%u", generation, game_pid, target);
    uintptr_t address = diagnostic_failure() ? 0 : fps_address();
    if (!address) {
        diagnostic("worker resolution failed generation=%u game=%lu; no FPS write issued", generation, game_pid);
        return worker_failure(diagnostic_failure() ? diagnostic_failure() : ERROR_NOT_FOUND,
            0, 0, "scan");
    }
    InterlockedExchange(&worker_state, 2);
    diagnostic("worker applying generation=%u game=%lu address=0x%llx target=%u", generation, game_pid,
        (unsigned long long)address, target);
    HANDLE waits[] = {worker_stop, game};
    DWORD wait;
    int observed = 0, previous = 0;
    MemoryCounters counts = {0};
    while ((wait = WaitForMultipleObjects(2, waits, FALSE, 0)) == WAIT_TIMEOUT) {
        if (diagnostic_failure()) {
            InterlockedExchange(&worker_error, (LONG)diagnostic_failure());
            InterlockedExchange(&worker_state, 4);
            return 1;
        }
        int current;
        MemoryTransfer transfer = memory_transfer(address, &current, sizeof(current), 0);
        counts.reads++;
        int ok = transfer.error == 0;
        if (ok) counts.read_ok++;
        if (ok && current == (int)target) counts.equal++;
        if (ok && (!observed || previous != current)) {
            diagnostic("read generation=%u game=%lu address=0x%llx value=%d target=%u action=%s", generation,
                game_pid, (unsigned long long)address, current, target, current == (int)target ? "equal" : "write");
            observed = 1; previous = current;
        }
        if (ok && current != (int)target) {
            diagnostic("write begin generation=%u game=%lu address=0x%llx read=%d target=%u bytes=%llu", generation,
                game_pid, (unsigned long long)address, current, target, (unsigned long long)sizeof(target));
            /* Never proceed with an unrecorded FPS write after logging fails. */
            if (diagnostic_failure()) {
                InterlockedExchange(&worker_error, (LONG)diagnostic_failure());
                InterlockedExchange(&worker_state, 4);
                return 1;
            }
            transfer = memory_transfer(address, &target, sizeof(target), 1);
            counts.writes++;
            ok = transfer.error == 0;
            if (ok) counts.write_ok++;
        }
        if (!ok) {
            int failed = worker_failure(transfer.error, address, transfer.terminating, "read/write");
            memory_heartbeat(&counts, address, 1);
            return failed;
        }
        memory_heartbeat(&counts, address, 0);
        wait = WaitForMultipleObjects(2, waits, FALSE, 200);
        if (wait != WAIT_TIMEOUT) break;
    }
    if (wait == WAIT_FAILED) {
        InterlockedExchange(&worker_error, (LONG)GetLastError());
        InterlockedExchange(&worker_state, 4);
    } else InterlockedExchange(&worker_state, 3);
    memory_heartbeat(&counts, address, 1);
    diagnostic("worker ended generation=%u state=%ld", generation, InterlockedCompareExchange(&worker_state, 0, 0));
    return 0;
}
