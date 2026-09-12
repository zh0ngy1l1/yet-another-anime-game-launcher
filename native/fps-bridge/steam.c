/* MIT. Keep the existing signed Steam shim unchanged. It starts our relay;
 * only after that rendezvous do we create the game with the RETAINED shim
 * HANDLE as PROC_THREAD_ATTRIBUTE_PARENT_PROCESS. No PID is opened as a handle.
 * See steam-source.md for the inspected shim path and its support boundary. */
#include <winternl.h>

#define STEAM_PROTOCOL 2
#define STEAM_MAGIC 0x59415332
typedef struct {
    DWORD magic, version, shim_pid;
    char token[65];
    LONG state; /* 0 awaiting relay, 1 ready, 2 released/cancelled */
    LONG relay_pid; /* diagnostic only; a single relay may acknowledge */
} SteamRendezvous;

static HANDLE shim, steam_job, steam_mapping, steam_ready, steam_release;
static SteamRendezvous *steam_slot;
static DWORD shim_pid, steam_error;
static int shim_exited, steam_acknowledged;

static DWORD parent_pid(HANDLE process) {
    typedef NTSTATUS (WINAPI *Query)(HANDLE, PROCESSINFOCLASS, void *, ULONG, ULONG *);
    Query query = (Query)(void *)GetProcAddress(GetModuleHandleW(L"ntdll.dll"), "NtQueryInformationProcess");
    PROCESS_BASIC_INFORMATION info;
    if (!query || query(process, ProcessBasicInformation, &info, sizeof(info), NULL)) return 0;
    return (DWORD)info.InheritedFromUniqueProcessId;
}

static int steam_name(wchar_t *name, const wchar_t *request, const wchar_t *suffix) {
    if (wcslen(request) != 64) return 0;
    for (unsigned i = 0; i < 64; i++)
        if (!((request[i] >= L'0' && request[i] <= L'9') || (request[i] >= L'a' && request[i] <= L'f'))) return 0;
    return swprintf(name, 128, L"Local\\YAAGL.FPS.%ls.%ls", request, suffix) > 0;
}

static int valid_steam_slot(const SteamRendezvous *slot, const wchar_t *request) {
    if (slot->magic != STEAM_MAGIC || slot->version != STEAM_PROTOCOL || !slot->shim_pid || slot->token[64]) return 0;
    for (unsigned i = 0; i < 64; i++) if (slot->token[i] != request[i]) return 0;
    return 1;
}

/* Runs only as the signed shim's .exe child. It never creates/opens a game,
 * performs registry setup or applies FPS. A timeout cannot authorize a game.
 * After acknowledging it waits for root GAME exit, not job/bridge release. */
static int steam_relay_main(int argc, wchar_t **argv) {
    wchar_t name[128];
    if (argc != 3 || !steam_name(name, argv[2], L"map")) return 20;
    HANDLE mapping = OpenFileMappingW(FILE_MAP_ALL_ACCESS, FALSE, name);
    if (!mapping) return 21;
    SteamRendezvous *slot = MapViewOfFile(mapping, FILE_MAP_ALL_ACCESS, 0, 0, sizeof(*slot));
    if (!slot || !valid_steam_slot(slot, argv[2]) || parent_pid(GetCurrentProcess()) != slot->shim_pid) return 22;
    steam_name(name, argv[2], L"ready");
    HANDLE ready = OpenEventW(EVENT_MODIFY_STATE, FALSE, name);
    steam_name(name, argv[2], L"release");
    HANDLE release = OpenEventW(SYNCHRONIZE, FALSE, name);
    if (!ready || !release || InterlockedCompareExchange(&slot->relay_pid, (LONG)GetCurrentProcessId(), 0) != 0 ||
        InterlockedCompareExchange(&slot->state, 1, 0) != 0) return 23;
    if (!SetEvent(ready)) return 24;
    DWORD result = WaitForSingleObject(release, INFINITE);
    int ok = result == WAIT_OBJECT_0 && valid_steam_slot(slot, argv[2]) &&
             InterlockedCompareExchange(&slot->state, 0, 0) == 2;
    CloseHandle(ready); CloseHandle(release); UnmapViewOfFile(slot); CloseHandle(mapping);
    return ok ? 0 : 25;
}

static void release_steam_relay(void) {
    if (steam_slot) InterlockedExchange(&steam_slot->state, 2);
    if (steam_release && !SetEvent(steam_release)) steam_error = GetLastError();
}

static DWORD prepare_steam_rendezvous(const wchar_t *request) {
    wchar_t name[128];
    if (!steam_name(name, request, L"map")) return ERROR_INVALID_PARAMETER;
    steam_mapping = CreateFileMappingW(INVALID_HANDLE_VALUE, NULL, PAGE_READWRITE, 0, sizeof(SteamRendezvous), name);
    if (!steam_mapping) return GetLastError();
    if (GetLastError() == ERROR_ALREADY_EXISTS) { CloseHandle(steam_mapping); steam_mapping = NULL; return ERROR_ALREADY_EXISTS; }
    steam_slot = MapViewOfFile(steam_mapping, FILE_MAP_ALL_ACCESS, 0, 0, sizeof(*steam_slot));
    if (!steam_slot) return GetLastError();
    steam_name(name, request, L"ready");
    steam_ready = CreateEventW(NULL, TRUE, FALSE, name);
    if (!steam_ready) return GetLastError();
    if (GetLastError() == ERROR_ALREADY_EXISTS) { CloseHandle(steam_ready); steam_ready = NULL; return ERROR_ALREADY_EXISTS; }
    steam_name(name, request, L"release");
    steam_release = CreateEventW(NULL, TRUE, FALSE, name);
    if (!steam_release) return GetLastError();
    if (GetLastError() == ERROR_ALREADY_EXISTS) { CloseHandle(steam_release); steam_release = NULL; return ERROR_ALREADY_EXISTS; }
    steam_slot->magic = STEAM_MAGIC;
    steam_slot->version = STEAM_PROTOCOL;
    for (unsigned i = 0; i < 64; i++) steam_slot->token[i] = (char)request[i];
    return 0;
}

static void close_steam(void) {
    if (steam_slot) UnmapViewOfFile(steam_slot);
    if (steam_mapping) CloseHandle(steam_mapping);
    if (steam_ready) CloseHandle(steam_ready);
    if (steam_release) CloseHandle(steam_release);
    if (shim) CloseHandle(shim);
    if (steam_job) CloseHandle(steam_job);
}
