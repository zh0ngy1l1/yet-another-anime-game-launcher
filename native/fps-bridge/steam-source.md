# Steam Patch boundary and source evidence

The enabled route keeps **Enable Steam Patch on** and runs the existing signed
Steam shim. It does not launch directly behind that setting, select the shim as
the FPS target, modify its image, inject a DLL, or attach a debugger.

## What was inspected

`sidecar/protonextras/steam64.exe` is 111304 bytes, SHA-256
`0424339444c54bf1f9fdbadf12e4e2c90ceef41d987fe573b93f5f2ebfd8a657`.
The signed replacement entered local history in
`347fbd2cc89f30a5780a42d6889076b731edefed`. Removing the certificate overlay and
normalizing only the PE checksum/security-directory fields gives exactly the
99942 pre-signing bytes from its parent. Its embedded signing certificate is
**Dawn Winery Code Signing Certificate**, issued by **Dawn Winery CA1**, with a
DigiCert timestamp chain. The implementation preserves those signed bytes;
certificate extraction alone is not a claim about trust-store acceptance.

The accompanying signed `lsteamclient64.dll` is 5560872 bytes, SHA-256
`af50ed0d952ef98d99d4d3ff67b4836b545c9403894430fca31969f9f630637b`.
Both identities are pinned in `steam-artifacts.json`; the build verifies them
and generates the TypeScript manifest. Neither is rebuilt or re-signed.
Valve's redistribution notice is retained in `LICENSE.steam` and the existing
launcher copyright panel.

The inspected upstream reference is ValveSoftware/Proton
[`steam_helper/steam.c` at 8c0fbeb0503d2fc9ba7736b37e383279e45062bc](https://github.com/ValveSoftware/Proton/blob/8c0fbeb0503d2fc9ba7736b37e383279e45062bc/steam_helper/steam.c),
the last public file change before this binary's July 19, 2025 PE timestamp.
The July reference and the later `proton_10.0` revision
`e91ca2be0df2cef4c230cbbc0b86604d73a0bbf6` were inspected separately. The later
source adds setup absent from the July reference; it is not substituted for the
binary. Symbol-bearing disassembly of the actual pinned binary corroborates
the relevant `main`, `steam_command_handler`, `run_process`, registry-init and
wait branches described below. **Exact source revision/build correspondence
for that third-party binary has not been established.** The local bridge is new
auditable source; it is not represented as the source of the signed shim.

The reference and actual binary show:

- An absolute Windows `.exe` argument follows `CreateProcessW`, not the URI/
  native-Steam forwarding or `ShellExecuteW` branches. It receives the remaining
  command line, inherited environment and current directory. The launcher’s
  disabled Steam branch passes the game path with **no cloud arguments** and
  does not execute `config.bat`.
- `SteamGameId` **presence**, including empty text, enables a different Proton
  service path: Steam windows/events, `ActiveProcess\\pid`, loading
  `lsteamclient`/`steamclient_init_registry`, Steam config/library files, optional
  VR initialization, a Wine system-process request, DRM/restart machinery and
  optional debugger-attach waiting. This launcher does not set `SteamGameId`.
- Without that variable, the shim creates its `.exe` child, closes the initial
  thread handle, waits for the retained child handle and returns its exit code.
  No Steam registry/library initialization or restart service is selected.
- `PROTON_HIDE_PROCESS_WINDOW` is honored for the game as in the shim. No
  Steam/environment variable is silently stripped. The enabled admission checks
  inherited and explicit context `SteamGameId` presence and rejects that separate
  service mode **before acquisition/setup**. The native boundary checks again
  before starting the shim. Disabled Steam behavior is unchanged.

Inspection downloads, disassembly, certificate extraction and feasibility output
are retained under `.tmp/steam-source-inspection/`. No canonical fetch or history
rewrite occurred. Source links are references, not reproducible-build evidence.

## Direct signed-shim creation and retained child ownership

The complete enabled process chain now starts with the verified canonical signed
Steam shim as Wine's initial executable. That outer shim creates the private GUI
bridge as its ordinary child and waits for it; the bridge then creates the inner
signed shim and the actual game described below. Before desktop or inner-shim
creation, the bridge requires its own actual parent to be live PID `0x20`, with
the canonical `C:\windows\system32\steam.exe` image and a creation time no later
than the bridge. It opens only that ancestor with query/synchronization rights
and retains its HANDLE through exit, preventing reuse of the PID queried by the
investigated game startup. This check is separate from FPS target ownership:
the game is still acquired only by duplicating the inner shim's retained child
HANDLE. A competing Wine user after the final preparation wait, wrong root image
or direct bridge entry fails visibly before any game is created. No process is
killed, and the protocol remains alive for normal empty-job release and outer
foreground completion.

The signed shim now receives the actual game command, matching the disabled
Steam route. It creates the game with its ordinary CreateProcessW branch;
there is no relay and no PROC_THREAD_ATTRIBUTE_PARENT_PROCESS override. This
preserves its actual child HANDLE, child command line, startup flags, inheritance
and FreeConsole ordering. The earlier parent-image/API equivalence fixtures did
not establish these properties. The new regression observes that the old route's
shim held only the relay HANDLE, while direct creation holds the actual child's.
It does not assert that Genshin uses that particular query.

1. Admission, private staging, canonical system32 verification and C: mapping
   checks are unchanged. SteamGameId service mode remains rejected before setup
   and again at the native boundary. The signed resources are not modified.
2. The bridge creates the signed shim suspended and retains its returned HANDLE.
   It assigns the unnamed Steam job before resuming that shim. Both jobs
   disallow breakaway and have no kill-on-close behavior. Thus all supported
   descendants are accounted for before any game execution, even while game
   identity is being established. The Steam count covers the entire tree.
3. The bridge queries the system handle snapshot supported by this Wine, examines
   only entries belonging to its retained shim, and duplicates candidate handles
   from that exact process object. It does not open a game PID, scan executable
   names globally, inject code, or ask a relay to identify the target. Snapshot
   entries are hints; each duplicated HANDLE must independently identify the
   expected executable, exact shim parent, creation time at or after that shim,
   and membership in the private Steam job. Multiple handles to one retained process
   object are allowed; multiple distinct candidate processes fail.
4. Before adoption, cumulative Steam-job TotalProcesses must still be exactly two:
   the shim and its sole ever-created child. The game is assigned to the nested game job, then that cumulative
   count is checked again. The count does not decrement on exit. This rejects an already-exited/replaced child and an eager descendant
   before adoption. A count, assignment or query failure never becomes permission to choose
   a later process; the Steam job continues to own the entire lifetime. The
   second check proves no child preceded nested assignment on a successful
   admission, preserving the separate game/descendant count. The shim must still be alive. These checks strengthen the
   pinned shim's inspected one-child, no-service-mode branch.
5. The accepted HANDLE becomes the immutable FPS and exit-status target. Game
   identity is acquired after creation, while lifetime ownership already exists
   through the jobs. There is no claim of an authenticated CreateProcess return
   handoff or possession of the game's initial thread. The existing automatic
   initialization/signature/write policy starts only after adoption. Once a
   target is accepted, descendants are tracked and never substituted for it.
6. A missed short-lived child, early shim exit, ambiguous tree or query failure
   produces a visible launch error. A failed adoption can therefore mean game
   execution occurred without an attributed game HANDLE. It does not mean no
   game ran. Jobs and the retained shim still gate cleanup. No running process
   is terminated to force adoption or release; only a never-resumed shim may be
   terminated if its initial assignment/resumption fails.
7. Release still requires both jobs empty, retained shim and any acquired game
   HANDLE exited, and the FPS worker ended. Supervisor acknowledgement, Wine
   waiting, exact registry restoration, another Wine wait and journal restoration
   remain separate prerequisites. Unknown states retain close/admission guards.

The strict first-child proof can reject legitimate software that creates a
Windows descendant before handle adoption. Such a failure is observable and
retains ownership; it is not silently retried with a weaker selection rule.
Fixtures cover this limit separately from descendants created after adoption.
The jobs do not account for native Unix forks, another prefix or pre-existing
services. Privileged same-user process/memory tampering remains outside the
existing guarantee.

The inspected source and binary identities above define this creation context.
The selected Wine double-forks child processes: persistent Unix PPID is normally
launchd on both routes, although the originating creator differs. The direct
shim also supplies its own ordinary Windows/Unix stream context, removing the
old split between a selected parent's Windows handle table and a bridge
creator's Unix handle lookup. GUI game stdout/stderr may be NULL, as on disabled
Steam. Persistent Unix exceptions and module diagnostics remain in `.wine.log`; serialized and flushed bridge diagnostics use the separate mandatory `.bridge.log`. The bridge uses the GUI subsystem so direct creation by the outer signed Steam shim does not allocate a Wine console.

## Mutations, limits and evidence

There are no additional shared registry mutations on the admitted shim path.
Fixtures compare the relevant Steam registry views and Steam library files before
and after. Inherited Proton service mode is rejected, not partially initialized.
The existing journal captures original prefix Steam/DLL destinations before each
copy, including partial-copy failures. The enabled Steam route, like the disabled
Steam route, writes but does not execute `config.bat`; it consequently does not
capture/restore the protection-file destination that only that script would
change. Other patch, graphics and registry preparation/restoration remains intact.
Request-private staged copies need removal, not restoration of shared originals.

Artifacts are checked at staging, before bridge boot and launch, and the bridge
again at each worker start/restart. The native bridge holds Win32 read handles
denying cooperating writers/deleters until release. POSIX same-user/administrator
replacement or runtime tampering remains outside that protection; the tests do
not claim privileged local attacker resistance. The bridge's game/job handles
do not strengthen the Perl supervisor's direct-child-only ownership guarantee.

The shim now directly creates the game with the canonical prefix path used by
disabled Steam. The shim itself is launched by the bridge inside its Steam job; the adopted
game subsequently joins the nested game job.
Preserving signed bytes and direct game creation is **not proof of current
Genshin world-load compatibility**, executable handoff behavior or achieved FPS. Those remain operator-run Step 7.5 gates. A handoff through a
pre-existing service/native Unix process/another prefix is unsupported. Other
launchers must not concurrently mutate the same game/Wine files. There is no
force-quit, launcher-crash or power-loss recovery promise. Packaged-app/release
verification remains a separate Step 8 gate.

A harmless four-arm context comparison did not establish that the former
private image path caused the pre-worker driver failure. Job membership, creator
and standard-handle differences remain explicit compatibility limits.

## Runtime desktop ordering and owned game lifetime

Wine 11.0 `dlls/win32u/winstation.c:get_desktop_window` lazily starts canonical
`explorer.exe /desktop` with `NtCreateUserProcess`, zero process flags and the
calling process as its parent. `server/process.c` consequently inherits that
caller's jobs. `server/winstation.c:remove_desktop_user` schedules an ordinary
`WM_CLOSE` only when the remaining desktop users are the desktop manager's own
threads. An outer Steam process and bridge waiting for an explorer-containing
game job form a circular wait.

The bridge now initializes the desktop before inner Steam or game creation,
from its own context outside both game jobs. It requires a live desktop owner
outside those jobs and records the owner and membership checks. No game-created
process is removed from a job or omitted from its counts. Runtime infrastructure
shutdown remains part of the foreground supervisor and full Wine-wait gates
before restoration.

The exact selected Wine reproduced the problem with a harmless real-window
fixture. With the earlier GUI bridge, the fixture's explorer became the sole
remaining member of both jobs after the fixture and its ordinary descendant
exited. Release remained refused. The failed baseline was recovered separately
with a PID/image/creation-checked ordinary desktop `WM_CLOSE`; it was not an
automatic cleanup pass. With desktop preparation, the same fixture's worker
wrote 120, descendant lifetime remained guarded, and both jobs, outer Steam
and Wine completed naturally. The production native Steam suite now includes
the real-window case at target 60, through the normal public test entrypoint.
An autonomous game result requiring desktop recovery must remain distinct from
an automatic cleanup pass on the corrected candidate.
