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

## Creation, rendezvous and lifetime

1. The existing synchronous admission lease covers preparation onward. A fresh
   private directory/token stages and verifies the bridge and signed Steam pair.
   The exact staged shim path is the selected executable; its adjacent signed
   DLL is preserved. Original prefix Steam-file preparation still runs and is
   journaled. No game or shim runs during artifact acquisition or registry save.
2. On `launch`, the bridge creates the **signed shim suspended**, retains its
   process handle and assigns a Steam job with no breakaway/kill-on-close flags
   before resuming. The shim runs the same staged bridge in `--steam-relay`
   mode. That mode never launches, scans or modifies a game.
3. A request-specific named mapping and ready/release events form the rendezvous.
   The bridge creates them exclusively before starting the shim. The relay checks
   the exact token, magic/version, expected Windows parent and single-use state;
   only one relay can acknowledge. Stale names, collisions, malformed messages or
   missing rendezvous cannot authorize game creation. A ten-second rendezvous
   timeout releases the relay if it arrives late, **not** ownership or a process
   lifetime. The original controller's 90/10/5-second policies remain unchanged.
4. After readiness, the bridge calls `CreateProcessW` for the exact game,
   suspended, using `PROC_THREAD_ATTRIBUTE_PARENT_PROCESS` with its **retained
   shim HANDLE**. No handle/PID received from the relay identifies the target.
   The returned game HANDLE is authoritative. Before resume, the bridge checks
   Windows parentage and inherited Steam-job membership, then assigns a nested
   game job. There is no interval of unaccounted game execution.
5. Wine takes inherited handles from the selected parent. Actual standard-stream
   handles are therefore transferred with `DuplicateHandle` into that retained
   parent and passed through an explicit inheritance list. Remote handles are
   closed once after creation, without retrying a potentially reused handle slot.
   The game keeps the Steam route's arguments/cwd and the existing plan's game
   environment; the bridge/worker keeps the companion environment.
6. The worker uses only the returned game HANDLE. Game exit stops FPS work and
   releases the relay; the shim's child wait can then finish. It does **not** wait
   for bridge/job release, which would be circular. Game descendants stay in the
   nested job and are never adopted as FPS targets. Early shim exit is observable
   independently from the still-live game and fails the transaction while it
   continues observing that game. Relay/shim nonzero exit is also reported.
7. Release requires game HANDLE exit, zero game and Steam jobs, shim HANDLE exit,
   and worker-thread completion. The supervisor must then confirm its direct
   Wine child separately, followed by request-owned Wine waiting, exact registry
   restoration, another Wine wait and journal restoration. Unknown states, failed
   cleanup and timeouts keep close/admission guarded with diagnostics/retry.

Wine's implementations were inspected at the unmodified `wine-11.0` tag:
[`kernelbase/process.c`](https://github.com/wine-mirror/wine/blob/wine-11.0/dlls/kernelbase/process.c),
[`server/process.c`](https://github.com/wine-mirror/wine/blob/wine-11.0/server/process.c),
[`server/handle.c`](https://github.com/wine-mirror/wine/blob/wine-11.0/server/handle.c).
The parent attribute references a process object with `PROCESS_CREATE_PROCESS`;
job and handle inheritance use that object. Real fixtures on the existing Wine
11.0 loader verify these paths. **Windows parentage is the compatibility property
tested here; macOS Unix parentage may differ.** A process snapshot or PID alone
does not establish ownership.

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

The relay changes the shim's child command line and the parent image is staged
privately. Preserving signed bytes and verified Windows parentage is **not proof
of current Genshin world-load compatibility**, executable handoff behavior or
achieved FPS. Those remain operator-run Step 7.5 gates. A handoff through a
pre-existing service/native Unix process/another prefix is unsupported. Other
launchers must not concurrently mutate the same game/Wine files. There is no
force-quit, launcher-crash or power-loss recovery promise. Packaged-app/release
verification remains a separate Step 8 gate.
