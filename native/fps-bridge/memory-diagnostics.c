/* Included by the bridge and the portable inert API regression. These probes
 * only observe the retained HANDLE. They never change memory or process state. */
typedef struct {
    BOOL api_ok;
    SIZE_T transferred;
    DWORD api_error, error;
    int terminating;
} MemoryTransfer;

typedef struct {
    unsigned long long reads, read_ok, writes, write_ok, equal, mapping_changes;
    ULONGLONG last_heartbeat;
    int sampled;
    SIZE_T query_bytes;
    DWORD query_error;
    MEMORY_BASIC_INFORMATION mapping;
} MemoryCounters;

static void memory_failure_probe(const char *operation, uintptr_t address, SIZE_T length,
                                 MemoryTransfer *result) {
    DWORD saved_error = GetLastError();
    DWORD wait = WaitForSingleObject(game, 0);
    DWORD wait_error = wait == WAIT_FAILED ? GetLastError() : 0;
    DWORD exit_code = 0;
    BOOL exit_query_ok = GetExitCodeProcess(game, &exit_code);
    DWORD exit_error = exit_query_ok ? 0 : GetLastError();
    int exit_known = wait == WAIT_OBJECT_0 && exit_query_ok;
    MEMORY_BASIC_INFORMATION info = {0};
    SIZE_T native_bytes = 0;
    LONG query_status = query_memory_status(address, &info, &native_bytes);
    result->terminating = query_status == (LONG)0xc000010a;
    SIZE_T queried = VirtualQueryEx(game, (void *)address, &info, sizeof(info));
    DWORD query_error = queried ? 0 : GetLastError();
    diagnostic("memory failure probe generation=%u game=%lu operation=%s address=0x%llx requested=%llu apiOk=%d transferred=%llu apiError=%lu error=%lu wait=0x%lx waitError=%lu exitQueryOk=%d exitKnown=%d exitCode=0x%08lx exitError=%lu queryBytes=%llu queryError=%lu queryStatus=0x%08lx terminating=%d region=0x%llx size=%llu state=0x%lx allocation=0x%lx current=0x%lx type=0x%lx; observation after failure",
        generation, game_pid, operation, (unsigned long long)address, (unsigned long long)length,
        result->api_ok, (unsigned long long)result->transferred, result->api_error, result->error,
        wait, wait_error, exit_query_ok, exit_known, exit_code, exit_error, (unsigned long long)queried, query_error, (unsigned long)(DWORD)query_status, result->terminating,
        (unsigned long long)(uintptr_t)info.BaseAddress, (unsigned long long)info.RegionSize,
        info.State, info.AllocationProtect, info.Protect, info.Type);
    SetLastError(saved_error);
}

static MemoryTransfer memory_transfer(uintptr_t address, void *buffer, SIZE_T length, int writing) {
    MemoryTransfer result = {0};
    if (writing)
        result.api_ok = WriteProcessMemory(game, (void *)address, buffer, length, &result.transferred);
    else
        result.api_ok = ReadProcessMemory(game, (void *)address, buffer, length, &result.transferred);
    /* Capture before diagnostics, probes, or any other API can replace it.
     * A successful short transfer has no defined LastError to consume. */
    result.api_error = result.api_ok ? 0 : GetLastError();
    result.error = result.api_ok ? (result.transferred == length ? 0 : ERROR_PARTIAL_COPY) :
        (result.api_error ? result.api_error : (writing ? ERROR_WRITE_FAULT : ERROR_READ_FAULT));
    if (writing)
        diagnostic("write end generation=%u game=%lu ok=%d written=%llu error=%lu apiError=%lu requested=%llu address=0x%llx",
            generation, game_pid, result.api_ok, (unsigned long long)result.transferred,
            result.error, result.api_error, (unsigned long long)length, (unsigned long long)address);
    else if (result.error)
        diagnostic("read failed game=%lu address=0x%llx requested=%llu read=%llu ok=%d error=%lu apiError=%lu",
            game_pid, (unsigned long long)address, (unsigned long long)length,
            (unsigned long long)result.transferred, result.api_ok, result.error, result.api_error);
    if (result.error) memory_failure_probe(writing ? "write" : "read", address, length, &result);
    SetLastError(result.error);
    return result;
}

static int memory_mapping_changed(const MEMORY_BASIC_INFORMATION *a, const MEMORY_BASIC_INFORMATION *b) {
    return a->BaseAddress != b->BaseAddress || a->AllocationBase != b->AllocationBase ||
        a->RegionSize != b->RegionSize || a->State != b->State || a->Protect != b->Protect ||
        a->AllocationProtect != b->AllocationProtect || a->Type != b->Type;
}

/* Five seconds is a logging interval, never a readiness rule or added wait.
 * Sampling can miss transient changes; a heartbeat is not fault-time evidence. */
static void memory_heartbeat(MemoryCounters *counts, uintptr_t address, int final) {
    DWORD saved_error = GetLastError();
    ULONGLONG now = GetTickCount64();
    if (!final && counts->sampled && now - counts->last_heartbeat < 5000) {
        SetLastError(saved_error);
        return;
    }
    MEMORY_BASIC_INFORMATION info = {0};
    SIZE_T queried = VirtualQueryEx(game, (void *)address, &info, sizeof(info));
    DWORD query_error = queried ? 0 : GetLastError();
    int changed = counts->sampled && (queried != counts->query_bytes || query_error != counts->query_error ||
        memory_mapping_changed(&info, &counts->mapping));
    if (changed) counts->mapping_changes++;
    counts->sampled = 1;
    counts->last_heartbeat = now;
    counts->query_bytes = queried;
    counts->query_error = query_error;
    counts->mapping = info;
    diagnostic("worker heartbeat generation=%u game=%lu target=%u address=0x%llx reads=%llu readOk=%llu writes=%llu writeOk=%llu equal=%llu mappingChanges=%llu mappingChanged=%d final=%d queryBytes=%llu queryError=%lu region=0x%llx size=%llu state=0x%lx allocation=0x%lx current=0x%lx type=0x%lx; sampled observation",
        generation, game_pid, target, (unsigned long long)address, counts->reads, counts->read_ok,
        counts->writes, counts->write_ok, counts->equal,
        counts->mapping_changes, changed, final, (unsigned long long)queried, query_error,
        (unsigned long long)(uintptr_t)info.BaseAddress, (unsigned long long)info.RegionSize,
        info.State, info.AllocationProtect, info.Protect, info.Type);
    SetLastError(saved_error);
}
