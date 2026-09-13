/* MIT. The unchanged signed shim creates the actual game. The bridge duplicates
 * its retained child HANDLE; it never opens a game by PID or image-name search.
 * An unnamed Steam job owns the tree before the shim's first instruction.
 * See steam-source.md for the cumulative-history proof and fail-closed limits. */
#include <winternl.h>

static HANDLE shim, steam_job, steam_bootstrap;
static DWORD shim_pid, steam_error;
static int shim_exited, steam_acknowledged;

static DWORD parent_pid(HANDLE process) {
    typedef NTSTATUS (WINAPI *Query)(HANDLE, PROCESSINFOCLASS, void *, ULONG, ULONG *);
    Query query = (Query)(void *)GetProcAddress(GetModuleHandleW(L"ntdll.dll"), "NtQueryInformationProcess");
    PROCESS_BASIC_INFORMATION info;
    if (!query || query(process, ProcessBasicInformation, &info, sizeof(info), NULL)) return 0;
    return (DWORD)info.InheritedFromUniqueProcessId;
}

static ULONGLONG process_creation(HANDLE process) {
    FILETIME created, exited, kernel, user;
    if (!GetProcessTimes(process, &created, &exited, &kernel, &user)) return 0;
    return ((ULONGLONG)created.dwHighDateTime << 32) | created.dwLowDateTime;
}

static DWORD validate_steam_environment(void) {
    /* Presence, including an empty value, selects unsupported service mode. */
    wchar_t *environment = GetEnvironmentStringsW();
    if (!environment) return GetLastError();
    int unsupported = 0;
    for (const wchar_t *entry = environment; *entry; entry += wcslen(entry) + 1)
        if (!_wcsnicmp(entry, L"SteamGameId=", 12)) unsupported = 1;
    FreeEnvironmentStringsW(environment);
    return unsupported ? ERROR_NOT_SUPPORTED : 0;
}

/* The supported Steam route starts a fresh Wine session with the unchanged
 * canonical signed shim. Current HK4E startup queries the first Wine process,
 * PID 0x20. A wineserver wait is not an atomic prefix reservation: reject a
 * competing Wine user or a different entry context before creating any game.
 * This ancestor is queried only; no process is adopted, written or stopped. */
static DWORD validate_steam_bootstrap(void) {
    DWORD parent = parent_pid(GetCurrentProcess()), error = 0, length = 32768;
    wchar_t image[32768] = {0};
    ULONGLONG own_created = process_creation(GetCurrentProcess()), created = 0;
    HANDLE candidate = NULL;
    if (parent != 0x20) error = ERROR_BAD_ENVIRONMENT;
    else {
        candidate = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION | SYNCHRONIZE, FALSE, parent);
        if (!candidate) error = GetLastError();
        else {
            created = process_creation(candidate);
            if (!QueryFullProcessImageNameW(candidate, 0, image, &length)) error = GetLastError();
            else if (length >= 32768 || _wcsicmp(image, L"C:\\windows\\system32\\steam.exe") ||
                !own_created || !created || created > own_created ||
                GetProcessId(candidate) != parent || parent_pid(GetCurrentProcess()) != parent ||
                WaitForSingleObject(candidate, 0) != WAIT_TIMEOUT) error = ERROR_BAD_ENVIRONMENT;
        }
    }
    if (error) {
        diagnostic("Steam bootstrap rejected parent=%lu expected=32 image=%ls error=%lu; no game or inner shim created", parent, image, error);
        if (candidate) CloseHandle(candidate);
        return ERROR_BAD_ENVIRONMENT;
    }
    /* Retain the exact ancestor object through bridge exit so its PID cannot
     * be recycled between this check and the game's own startup query. */
    steam_bootstrap = candidate;
    diagnostic("Steam bootstrap retained parent=%lu image=%ls created=%llu bridgeCreated=%llu", parent, image,
        (unsigned long long)created, (unsigned long long)own_created);
    return 0;
}

/* Native SystemExtendedHandleInformation layout, supported by the selected
 * Wine. Other processes' entries are neither selected nor recorded. The type
 * index is discovered from our own retained shim handle, never hard-coded. */
typedef struct {
    void *object;
    ULONG_PTR owner, value;
    ULONG access;
    USHORT backtrace, type;
    ULONG attributes, reserved;
} SteamHandleEntry;
typedef struct {
    ULONG_PTR count, reserved;
    SteamHandleEntry entries[1];
} SteamHandleSnapshot;

static DWORD steam_handle_snapshot(SteamHandleSnapshot **result) {
    typedef NTSTATUS (WINAPI *Query)(ULONG, void *, ULONG, ULONG *);
    Query query = (Query)(void *)GetProcAddress(GetModuleHandleW(L"ntdll.dll"), "NtQuerySystemInformation");
    if (!query) return ERROR_NOT_SUPPORTED;
    ULONG size = 16384, needed = 0;
    for (unsigned attempt = 0; attempt < 12; attempt++) {
        SteamHandleSnapshot *snapshot = HeapAlloc(GetProcessHeap(), 0, size);
        if (!snapshot) return ERROR_NOT_ENOUGH_MEMORY;
        NTSTATUS status = query(64, snapshot, size, &needed);
        if (!status) {
            if (snapshot->count > (size - FIELD_OFFSET(SteamHandleSnapshot, entries)) / sizeof(SteamHandleEntry)) {
                HeapFree(GetProcessHeap(), 0, snapshot);
                return ERROR_INVALID_DATA;
            }
            *result = snapshot;
            return 0;
        }
        HeapFree(GetProcessHeap(), 0, snapshot);
        if ((ULONG)status != 0xc0000004) return ERROR_NOT_SUPPORTED;
        ULONG next = needed > size ? needed : size * 2;
        if (next <= size || next > 16 * 1024 * 1024) return ERROR_BUFFER_OVERFLOW;
        size = next;
    }
    return ERROR_RETRY;
}

/* Success returns one durable object, not a source-slot number or a reopened
 * PID. Validate again after duplication because source slots can close/recycle.
 * Monotonic TotalProcesses == 2 proves that only shim + root have EVER joined
 * the request job. Eager descendants before adoption are rejected visibly;
 * this count must never be waited down or used to select a replacement. */
static DWORD acquire_steam_child(HANDLE ownership_job, const wchar_t *expected, HANDLE *retained) {
    SteamHandleSnapshot *snapshot = NULL;
    DWORD error = steam_handle_snapshot(&snapshot);
    if (error) return error;
    USHORT process_type = 0;
    for (ULONG_PTR i = 0; i < snapshot->count; i++) {
        const SteamHandleEntry *entry = &snapshot->entries[i];
        if (entry->owner == GetCurrentProcessId() && entry->value == (ULONG_PTR)shim) process_type = entry->type;
    }
    HANDLE selected = NULL;
    DWORD selected_pid = 0;
    unsigned matches = 0;
    ULONGLONG shim_created = process_creation(shim);
    if (!process_type || !shim_created) error = ERROR_INVALID_DATA;
    for (ULONG_PTR i = 0; !error && i < snapshot->count; i++) {
        const SteamHandleEntry *entry = &snapshot->entries[i];
        if (entry->owner != shim_pid || entry->type != process_type) continue;
        HANDLE candidate = NULL;
        /* AssignProcessToJobObject requires SET_QUOTA and TERMINATE even though
         * this bridge never terminates an already-running game. */
        DWORD rights = PROCESS_QUERY_INFORMATION | PROCESS_VM_READ | PROCESS_VM_WRITE | PROCESS_VM_OPERATION |
            PROCESS_SET_QUOTA | PROCESS_TERMINATE | SYNCHRONIZE;
        if (!DuplicateHandle(shim, (HANDLE)entry->value, GetCurrentProcess(), &candidate, rights, FALSE, 0)) continue;
        DWORD pid = GetProcessId(candidate), length = 32768;
        wchar_t image[32768] = {0};
        BOOL own = FALSE, steam = FALSE;
        ULONGLONG created = process_creation(candidate);
        if (pid && pid != shim_pid && created >= shim_created &&
            parent_pid(candidate) == shim_pid &&
            IsProcessInJob(candidate, ownership_job, &own) && own &&
            IsProcessInJob(candidate, steam_job, &steam) && steam &&
            QueryFullProcessImageNameW(candidate, 0, image, &length) && length < 32768 && !_wcsicmp(image, expected)) {
            /* With a retained HANDLE, equal PID means the same live object even
             * when several source handles refer to it. Keep one reference. */
            if (selected && selected_pid == pid) { CloseHandle(candidate); continue; }
            matches++;
            if (!selected) { selected = candidate; selected_pid = pid; }
            else CloseHandle(candidate);
        } else CloseHandle(candidate);
    }
    HeapFree(GetProcessHeap(), 0, snapshot);
    JOBOBJECT_BASIC_ACCOUNTING_INFORMATION accounting;
    if (!error && !QueryInformationJobObject(ownership_job, JobObjectBasicAccountingInformation, &accounting, sizeof(accounting), NULL)) error = GetLastError();
    if (!error && accounting.TotalProcesses > 2) {
        diagnostic("Steam ownership rejected total=%lu expected=2; descendant existed before target adoption", accounting.TotalProcesses);
        error = ERROR_INVALID_DATA;
    }
    if (!error && WaitForSingleObject(shim, 0) != WAIT_TIMEOUT) error = ERROR_PROCESS_ABORTED;
    if (!error && matches > 1) error = ERROR_INVALID_DATA;
    if (!error && (!matches || accounting.TotalProcesses != 2)) error = ERROR_RETRY;
    if (error) {
        if (selected) CloseHandle(selected);
        return error;
    }
    *retained = selected;
    return 0;
}

static void close_steam(void) {
    if (shim) CloseHandle(shim);
    if (steam_job) CloseHandle(steam_job);
    if (steam_bootstrap) CloseHandle(steam_bootstrap);
}
