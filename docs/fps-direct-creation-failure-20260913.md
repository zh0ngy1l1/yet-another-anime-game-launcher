# Enabled startup investigation and Steam bootstrap correction

The enabled pre-worker crash is explained by a startup context difference:
Genshin 7.0.0 inspects Windows PID 32 and compares its executable path with
`c:\windows\system32\steam.exe`. The previous enabled route put the private
bridge at PID 32. The disabled route put the genuine signed Steam shim there.
An unchanged diagnostic enabled run reproduced the fault; making that same
signed Steam shim the outer foreground Wine process reached rendering and
started the FPS worker. This is stronger evidence than matching crash symptoms.

The implementation preserves the inner signed Steam creation of the actual
game and its retained child HANDLE, strict nested jobs, worker ownership,
foreground supervisor and restoration gates. It also makes the bridge a GUI
executable and gives it a mandatory flushed `.bridge.log`; the signed outer
Steam launch otherwise gives a console bridge its own Wine console and removes
its diagnostics from the Unix Wine log. Logging failures remain observable and
prevent further worker writes.

A real enabled-60 GUI candidate reached the start screen and displayed 60 FPS
with generation 1 applying across a 30-second observation. Normal game exit was
zero. That run exposed a separate cleanup cycle: a late Wine desktop process
remained in the game job. The guard retained ownership correctly; this run is
**not an automatic-cleanup pass**, and target 120 has not advanced past that
failure. The desktop initialization correction and its regression are recorded
below as they are validated.

The original selected Wine still has the historical post-write protection
hazard. One captured successful 60 write actually reached its temporary
PAGE_NOACCESS transition without crashing. The bootstrap correction does not
repair that independent runtime mechanism. No installed/development Wine is
replaced by this implementation.

Only the root investigator coordinates the operator-authorized autonomous game
runs. Fixtures use isolated prefixes and locally compiled harmless executables.
Packaged gameplay, above-60 gameplay and enabled 61 are not accepted results.

## Preserved current evidence

The tested candidate is `1daea26a66afa01633df1ed7adb9328cf7977578`, with protocol-3
bridge SHA-256
`12db0203a736f56b51c424c3ad26d2efbbdae4b5b870b8f62df639b024e182ba`
(36,864 bytes). Selected development Wine retains the original `ntdll.so`
SHA-256 `f26ade35f5b49e33b3780b6adc71f9eb9c831ea40222c1bae667ac14135d984b`.
Steam Patch remains on, Launch Fix/block hosts off, game Global 7.0.0 and DXMT
0.80.0. The enabled test's target and game DXMT maximum were both 60.

Full source evidence was preserved before further investigation under:

`/Users/david/Library/Application Support/YAAGL Local Builds/fps-direct-failure-20260913T204809Z`

The root's `preserved/manifest.json` records the capture. `trace-comparison`
contains the streamed disabled-log summary, module records, line-numbered
enabled trace, exact module metadata/disassembly and detailed findings. The
disabled log is **2,328,644,701 bytes** and was streamed rather than loaded into
memory. Existing evidence, commits, authorization, installed Wine and prior app
outputs remain separate.

| Evidence        | Fresh disabled control                        | Enabled direct Steam, target 60                                    |
| --------------- | --------------------------------------------- | ------------------------------------------------------------------ |
| Run             | `game_1789331460264.log`                      | `game_1789331743777.log.wine.log`                                  |
| Identity        | `/tmp/yaagl-launch.QONNqF3G27`                | `b0407bbbac958d6c5e4c3f1a682030f73e4dca40073bda07b5666bd7b2a90b1a` |
| Observed result | Operator reports checkpoint stage 2 completed | Game PID 208 exits `0xc0000005`                                    |
| Worker          | None expected                                 | Generation 0; no FPS worker starts                                 |
| Cleanup         | Confirmed at 16:33:27.322 EDT                 | Confirmed at 16:36:07.697 EDT                                      |

The control proceeds into game plugin initialization, supporting execution
beyond the failing enabled stage. Login stability and numerical FPS remain
operator observations; logs alone do not measure gameplay FPS. This fresh
control is distinct from the earlier operator-reported disabled pass.

## Sequence and available fault evidence

On September 13 EDT (UTC minus four hours), the enabled bridge starts at
16:35:50.019. At .204 it starts the canonical signed Steam shim PID 200 with the
actual game command and assigns the Steam job before resuming it. At .358 the
bridge retains the direct child HANDLE for game PID 208 with cumulative job
count two. Adoption at .359 records the expected parent, repository-root cwd and
DXMT maximum 60. The earlier relay and selected-parent creation route is absent.

Both runs' game main threads load exactly the same ordered module paths, bases
and native/builtin identities through `MHYPBase.dll`. Both then enter
`GetModuleFileNameExA(process=0x128, module=NULL, buffer=0x10dc80, size=260)`.
Those original logs did not capture the returned path or process object behind
that game-local handle; the new diagnostic run below resolves them. Identical argument values do not establish identical queried objects.

The disabled run continues through repeated handled syscall failures and later
game plugin loads. Its complete log contains no `WDFLDR`, `HoYoProtect`,
`initDriver` or fatal `dispatch_exception code=c0000005` record. The enabled
run instead records the previously identified DeleteService rights check,
attempted HoYoProtect initialization, a missing `WDFLDR.SYS` dependency and
driver load status `c0000142`. At Wine tick 430.054, 32 ms after the driver-load
failure, game thread `00ec` raises a write access violation to `0x1000`.
Generation remains zero when the retained game HANDLE reports exit at
16:35:59.609. The worker did not execute; this does not mean every component
performed zero memory writes.

Current module attribution is stronger than in the previous attempts:

- This run records `MHYPBase.dll` loaded at `0x6ffffc230000`. Its exact current
  file is 27,290,488 bytes, SHA-256
  `cdc79ffdb73bd2e157c7faee33740f84aa7aec845c8cb4d943f8fb4dff29d01e`.
  Image size is `0x1a18000`; no unload is logged before the fault.
- Fault IP `0x6ffffda933d8` is **MHYPBase + `0x18633d8`**. With preferred PE base
  `0x180000000`, the corresponding static address is `0x1818633d8`; its `.upx0`
  file offset is `0x184d3d8`.
- Disk bytes `49 89 0b` decode to `mov QWORD PTR [r11], rcx`. Recorded registers
  `r11=0x1000` and `rcx=0x88776666` agree with the write-fault metadata. This is a
  matching static instruction, not a captured fault-time memory image.

The previous hypothetical module offset `+0x17833d8` must not be reused for this
run. Stack memory, a complete call stack, fault-time instruction bytes and page
protections remain absent. Exception-handler traversal is not a call stack, and
register constants alone do not establish an intentional abort or its cause.
The missing dependency explains why the attempted driver cannot initialize; the
decision to attempt that path, and its causal connection to the fatal write,
remain unresolved.

## Cleanup is a separate confirmed result

For the enabled request, sequence 53 at 16:35:59.707 records known game exit,
game job zero, `workerDone=1`, Steam job zero and `shimExited=1`. Sequence 55 at
16:35:59.939 acknowledges `released=1`. The foreground Wine supervisor confirms
status zero at .957. The first request-owned Wine wait finishes at
16:36:03.108; registry restoration and owned execution are acknowledged at
03.888; the second Wine wait finishes at 06.996; registry/file restoration and
private cleanup complete at 07.697. Removed live preimages cannot independently
re-prove every original restored byte. No forced release was used.

## Controlled autonomous evidence (UTC)

All runs below used the exact existing development game/profile, Steam Patch ON,
Launch Fix OFF, original `ntdll.so`, DXMT 0.80.0 and target 60. Their production
launch transactions used the matching local native RPC runtime and complete
production ownership/restoration code. Their launcher logs are in the external
run directories; game logs remain in `yaaglwdos/logs`. This exercises the actual
transaction but does not establish a rendered-launcher UI pass.

| Run under `autonomous/` | Result | Cleanup |
| --- | --- | --- |
| `diagnostic-enabled60-1` | Unchanged bridge-first path; PID 208 exits `c0000005`, generation 0 | Completed 21:54:15.489; independently restored 25 file states and 2 registry values |
| `outer-steam-enabled60-1` | Canonical outer Steam PID 32; game PID 288; generation 1 writes -1 to 60, then reads 60; rendering reached | Ordinary game close; exit 0; completed 22:06:36.368; independently restored 25 file states and 2 registry values |
| `gui-enabled60-1` | Console-free bridge; game PID 216; worker generation 1 writes -1 to 60, reads 60; start screen and 60 FPS observed for 30 seconds | Game exit 0 at 22:35:41.163; worker done and shim exited; one descendant retained, so automatic restoration correctly blocked |

The first run's `game_1789336431740.log.wine.log` is 10,246,382 bytes, SHA-256
`a313a79918095d89087af6de19ab9ae484c93851ed5ccc98d5a1e1edbe08b4cc`.
Its `-analysis/FINDINGS.md`, disassembly and line-numbered server excerpts bind
the game-local HANDLE 0x128 to a literal OpenProcess PID 32 query. Exact current
MHYPBase code passes PID 32 and full process access, gets its module filename,
and compares it case-insensitively with the decoded canonical Steam path.
The predicate feeds an internal metadata object; the entire downstream driver
branch has not been decoded. It is not evidence about a process group or merely
the game's immediate parent.

The second run's `game_1789337023580.log.wine.log` is 2,549,150,209 bytes, SHA-256
`36e4f97f0044f11c5203277fcd2c4c47e4dabbafd23d361ea8753ce5d0286cda`.
Server records and recovered console fragments establish Steam PID 32, bridge
200, inner Steam 280 and game 288. Worker generation 1 resolved the main image
at 0x140000000, target 0x1452b4244 (RVA 0x52b4244), allocation protection 0x80,
current protection 0x08. At 22:04:04.270 it successfully wrote four bytes from
**-1** to 60, then read 60 at .527. Login was not verified in this earlier run.
The console fragments are retained separately without replacing the full log.

The third run's durable `game_1789337933285.log.bridge.log` records bridge
`dd1ee42fe2ae5487a6195af037fe395d20f933a64f83bc8c752e8bf8bf78a4b6`
(37,888 bytes), no console window, direct inner Steam/game creation and worker
start at 22:19:10.441. It writes -1 to 60 at 22:19:11.005 and reads 60 at .205.
Four retained screenshots/status records in `login-observation` span
22:31:12.726–22:31:43.600, with the start screen and HUD 60.00. The sample game
PID, request token and worker generation match the durable bridge log.
Normal WM_CLOSE was addressed only to the verified game image/PID/creation
identity. Subsequent guard captures retain the descendant and restoration
preimages. No release command was forged and no process was forcibly killed.

## Current versus historical mechanism

The present pre-worker fatal instruction is MHYPBase +0x18633d8, writing to
0x1000 with generation 0. Historical faults read game data at RVA 0x52b4244 or
0x52b4ad8 after FPS writes, from different instruction offsets. Their matching
absolute target data address in the latest worker is evidence of page identity,
not proof that the earlier fatal MHYPBase instruction had the same cause.

Exact original Wine `toggle_executable_pages_for_rosetta()` classifies the page
using allocation protection instead of current protection after
NtWriteVirtualMemory. In the second autonomous run, the server records prove
this actual write reached protection 1 (PAGE_NOACCESS), then restored protection
8 on page 0x1452b4000. Both records have tick 5714.780; a tighter duration is not
captured. That write did not crash. The race remains a real runtime limitation.

The separate `runtime-candidate` evidence package compares the original library
with the verified signed revision-2 candidate
`eef64f611ae9033261a70f46ec0be38d58823717f14e80331946c6d0cd3c85f7`.
Revision 2 follows source commit `0d703b464a76d33c1215c2fc53170e64c136e1f4`,
revising `7552f9bb0a348df5400a8644e9374b345d3f5227`. Revision 1 beginning
`702394b6` is rejected and not a deployment input. The byte comparison finds
13 code bytes and 31 bytes of the existing embedded signature differ; all
remaining bytes match. Historical source/provenance/deployment records are
read-only evidence, not current deployment authorization or gameplay acceptance.

## Rejected alternatives and limits

A harmless file-sharing matrix proves the current GENERIC_READ + FILE_SHARE_READ
image guards deny writes, deletion and replacement. Zero-access guards admit
exclusive readers but fail to preserve those protections on this Wine; that
proposal is rejected. No current diagnostic trace establishes a sharing failure
as the startup cause. The guards remain intact.

Changing early process access rights can be done with retained-object handle
duplication, as an isolated fixture demonstrated, but it is not a supported fix
for the literal root-image predicate. Process-group changes, target ceilings,
arbitrary sleeps and manual arming do not address the evidence. None is added.

The disabled log contains millions of handled syscall-fault trace lines while
the game continues. An exception trace by itself is not a fatal crash, and
missing worker write lines do not prove zero writes by other components. Full
logs, bridge logs, native console output, request snapshots, registry and journal
preimages, crash-report discovery and independent restoration checks are retained
under the external evidence root. No old logs or retained requests are deleted.

The prior direct-creation implementation and package remain recorded in
[fps-direct-steam-candidate-20260913.md](fps-direct-steam-candidate-20260913.md).
The root manual checkpoint and new package must identify the final tested
candidate and distinguish its evidence from those superseded results.

## Desktop lifetime correction and guarded recovery

A read-only query of the GUI candidate bridge's actual job handles found exactly
one remaining process in both jobs: explorer PID 272, parent game PID 216,
creation FILETIME 134338115487330700. The game's retained exit code was zero,
the worker was done and the inner shim had exited. `GetDesktopWindow` identified
HWND 0x10020, class #32769, owned by that same live explorer identity.

Wine's `win32u/winstation.c` lazily creates explorer `/desktop` from the first
window user's process without breakaway. The game therefore created it inside
its jobs. `server/winstation.c` waits for desktop users to leave before requesting
explorer's normal exit. The bridge still used the desktop while awaiting those
jobs, creating a cycle. This is separate from the original generation-0 crash.
The older console bridge happened to initialize the desktop before the game.

After preserving the full guard and preimages, the root investigator requested
ordinary WM_CLOSE of only that proven desktop. Exact source shows this message
posts WM_QUIT; it does not call ExitWindows, unlike SC_CLOSE. No process was
terminated, no job was altered, and no bridge protocol command was forged.
Production observed jobs zero and release acknowledgement at 22:42:40.304,
then completed both Wine waits and restoration at 22:42:47.917; native exited
normally at .928. Independent comparison matched all 25 file states and both
registry values. This is a recovered failed checkpoint, not automatic cleanup.
The helper source, exact membership and intervention record are preserved in
`desktop-lifetime`; these recovery tools are not deployment machinery or new
manual instructions.

The correction initializes the legitimate desktop from the bridge before any
game creation and verifies its live owner is outside both empty game jobs.
Actual game descendants remain fully owned. Foreground completion and the final
Wine wait still cover runtime infrastructure shutdown; there is no descendant
exclusion, breakaway or kill-on-close policy.

A harmless real-window regression reproduced the old GUI failure: explorer PID
224 remained in both jobs after its fixture parent and ordinary descendant
exited, and release correctly refused. With desktop preparation, explorer was
created before the game, worker 120 and the ordinary-descendant guard passed,
both jobs emptied, and outer foreground plus Wine wait completed automatically
without recovery. `desktop-lifetime/desktop-results.json` indexes both isolated
prefixes and full evidence. These are fixtures, not above-60 gameplay evidence.

The outer Steam bootstrap additionally validates the bridge's actual live
canonical Steam parent at PID 32, including its creation time, and retains its
query-only HANDLE. This rejects a competing Wine session before inner shim/game
creation. The existing final prelaunch Wine wait is correct but cannot atomically
reserve the prefix against a separate launcher. Rejection is an observable launch
error in the normal protocol loop, permitting acknowledged empty-job cleanup.
It never adopts a game by PID or changes a process image.

## Validation record (final candidate)

The final native artifact is protocol 3, 38,912 bytes, SHA-256
`be4b09a0dea1aca9252a1297f1a0c26a46a67d564b9027f547e64b2bb71faa25`.
Both complete native suites pass, including real HWND creation, worker targets
1/60/61/120/360, unchanged decoys, worker restart, descendants, signatures,
nonzero exit, bootstrap rejection, eight shim faults and registry restoration.
These target results are harmless fixture results, not real-game target passes.

Pinned Node 16.20.2 and pnpm 7.33.7 validation passes: 1,959 Vitest tests in 20
files, TypeScript, formatting, lint (the existing nine warnings, zero errors),
five evidence-collector tests, real native normal-close/RPC concurrency and real
foreground-supervisor success/failure/decoy regressions. Full command records and
logs are under `checks`, with additional native evidence under `desktop-lifetime`
and `native-rpc-final`. The native Steam final fixture root is
`/private/var/folders/nn/34wh2q094x5f5qrtj4n8c76r0000gn/T/yaagl-bridge-fixture-NpdJyB`.

The RPC integration fixture initially omitted the final prelaunch Wine wait that
production `program-launch-game.ts` already performs. The new bootstrap guard
rejected that warm session before any game/worker, and cleanup restored its files.
The fixture now models that production setup boundary and detects early completed
failures promptly. Its persistent log assertions follow the separate Wine and
bridge outputs. `.wine.log` retains the supervisor's explicit mode 0600;
`.bridge.log` follows Win32 file creation permissions (observed 0644), like ordinary
game/Steam output. Request/journal directories retain their existing private
permissions. No global umask or runtime security metadata is changed.

The complete independent Wine R2 review candidate is at
`runtime-candidate/wine`; its original library is preserved separately.
`FINAL-STATE.json` and the full inventory verify only `ntdll.so` contents differ
from the copied original, with its existing valid signature retained. This is an
offline comparison candidate, not installed Wine or accepted gameplay. The app
excludes it.

All three final production native RPC cases passed against the final artifact:
normal worker/exit/restoration, held descendant lifetime with its expected visible
failure, and Steam artifact tampering rejected before any game/worker. The final
case finished at 22:59:01 UTC; all fixture Wine/native processes were confirmed
absent at 22:59:36. `native-rpc-final/README.md` and `FINAL-MANIFEST.json` preserve
the full results and preliminary fixture failures.

The final candidate's enabled-60 real-game preflight was then rejected because
macOS reported a locked console again. This happened before Wine, native owner or
game creation. It is **not a game attempt or an enabled-60 pass**. The operator
was asked to unlock again while commit and packaging work continued. Unless a
later result is appended below, the exact next game checkpoint remains final
candidate enabled 60 with automatic cleanup, followed only on success by 120 in
the world. No final-candidate above-60 gameplay or packaged-game pass is claimed.
