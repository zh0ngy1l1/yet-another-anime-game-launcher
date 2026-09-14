# Delayed gameplay crash and launcher cleanup candidate

Implementation commits: `5a620bef9c63d9e72cd243fcc29b55c09f2ee2ff`
(diagnostics/error classification), `6c48ca7c71ea844a83b09a535c158f6e0946f3fa`
(named-run evidence capture), and `3334d02302378e934c700c1109492b26170859e4`
(hidden startup/title/Launch Fix integration). The app's `manifests/build.json`
records the final delivery HEAD, including this report and manual checkpoint.

The strongest supported explanation for the additional target-150 crash is the
original Wine library's post-write page-protection race. The game fault occurred
in the same monotonic millisecond as a successful FPS write, reading different
data on the same page. The failed `ReadProcessMemory`/error 87 followed **2.002
seconds later**. This run does not capture the actual protection APCs or the
fault-time page state, so the precise interleaving remains an inference.

**This delivery does not install a Wine correction or establish crash-free
gameplay.** It corrects error classification, adds observational memory diagnostics,
implements hidden startup with a native clock, and integrates Launch Fix with
both FPS routes. No launcher, game, hidden application, WebView/RPC harness,
privileged helper, host-blocking operation or Wine command was executed during
this task. Prior successful results remain valid for their recorded runs; this
additional failure is preserved alongside them.

## Preserved sources and identities

The checkout started clean at `b0b732dca0422bc91e0928b0799b5026086bc4f2`, including
the Steam startup correction `648b4d227101d11a30e71888c3bf541c7d830c36`.
Before edits or builds, the actual profile was located by the unique filenames
and request token, then copied read-only into this new evidence root:

`/Users/david/Library/Application Support/YAAGL Local Builds/fps-delayed-crash-20260914T031349Z`

- `preserved/`: complete launcher/game/Steam/bridge/Wine logs, crash reports,
  settings and an explicit record of missing retained paths. The Wine log alone
  is 4,526,922,327 bytes, SHA-256
  `35e9cfe4e582447330eaa9a3ed17adf58c540182633d4cf8575219a7b91662dd`.
- `associated/`: deployed manifests/resources/configuration, registry files,
  read-only hosts snapshot, artifact identities and process observations.
- `baseline-artifacts/`: original native and bridge inputs/build records before
  regeneration. Existing dependencies, lockfiles and profiles were preserved.
- `analysis/`: exact UTC/monotonic timeline, byte-offset Wine excerpts, minidump
  parsing, raw stack, matching source instructions, recovered legacy documents,
  native source review and inert regression results. Start with
  `FINDINGS-native.md` and `delayed-crash-timeline.json`.

The actual profile is **`/Users/david/Library/Application Support/Yaagl OS FPS Review`**.
The transcribed `Yaag|` spelling was not used or renamed. Request
`da72105f7481644b657f8deeaa1e1c8f9644c88ba4e2e43d2b9bb6fb82cae92d`
owns `game_1789354929211.log.bridge.log` and `.wine.log`; `.steam.log` is empty
and an ordinary `.log` is absent. Neither absence substitutes for the other logs.

| Component | Bound identity for the failed run |
| --- | --- |
| Deployed build | Profile manifest source `b0b732dca0422bc91e0928b0799b5026086bc4f2`, matching the prior packaged delivery |
| Native runtime | ARM64 `4.11.0-yaagl-owned1`, 2,004,496 bytes, SHA-256 `3e04ed4a6d2b5389d7dbe525367881a08a5081314ef6dddf973227a66a3857e1`; manifest/admission evidence, no surviving launcher process mapping |
| Bridge | Protocol 3, 38,912 bytes, SHA-256 `be4b09a0dea1aca9252a1297f1a0c26a46a67d564b9027f547e64b2bb71faa25` |
| Selected Wine library | Profile `wine/lib/wine/x86_64-unix/ntdll.so`, 620,688 bytes, SHA-256 `f26ade35f5b49e33b3780b6adc71f9eb9c831ea40222c1bae667ac14135d984b`; dump native-module stream binds this exact loaded path at `0x20866e000` |
| Prefix | Profile `wineprefix`; the development and selected profile Wine libraries match the original hash |
| Game | Global 7.0.0, `/Users/david/.gimpact/GenshinImpact.exe`, 430,973,352 bytes, SHA-256 `a1a23cb76d941df28c5156ca3152fa49421ec98842221b7d71633d42ee76ca45` |
| MHYPBase | 27,290,488 bytes, SHA-256 `cdc79ffdb73bd2e157c7faee33740f84aa7aec845c8cb4d943f8fb4dff29d01e` |
| Options | FPS ON, **150**; Steam Patch ON; Timeout Fix ON; DXMT 0.80.0, game maximum 0 |
| Launch Fix | Saved `config_block_net=false`; the deployed FPS admission rejected true before bridge boot. Together these support OFF for this request. Older static hosts entries do not establish this option was enabled or caused the crash. |

The current dump is `mihoyocrash_4eb417fb6d9f6c4d86f2a94f531b0d75/crash.dmp`
under the profile prefix's user Temp directory, 761,750 bytes, SHA-256
`25d34fd206663cf06d5cec200111305ee3a58dd17fbd30080e29a64e32b3aba4`.
It independently identifies game process 280. Adjacent macOS `Yaagl` reports
at 22:47/22:59 describe a translated Intel native image, not this ARM64 runtime;
they are retained without misattribution.

## Sequence and the failing operation

All times below are UTC on September 14; the launcher's local log uses EDT.

| Time | Evidence |
| --- | --- |
| 03:02:09.414 | Request settings/identity recorded |
| 03:02:16.018 | Canonical outer Steam 32 retained; bridge 200 |
| 03:02:16.346 | Desktop 208 prepared outside both jobs |
| 03:02:16.520–.521 | Inner signed Steam 272's direct game child 280 retained/adopted |
| 03:02:27.463–.468 | Worker generation 1; target resolves to `0x1452b4244`, allocation protection `0x80`, current protection `0x08` |
| 03:02:28.033 | First successful four-byte write, from -1 to 150 |
| 03:02:41.646; 03:02:42.048; 03:03:27.701; 03:04:21.944; 03:05:11.980 | Five later successful writes after recorded resets to 60 |
| 03:06:46.467, bridge tick 23876948 | Seventh successful write, `ok=1 written=4` |
| Wine tick 23876.948 seconds | Fatal game read access violation, **same millisecond** as the write completion |
| 03:06:46.668 | Last successful readback 150; an exception need not instantly terminate the process |
| 03:06:48.469, tick 23878950 | `ReadProcessMemory` FALSE, requested 4, read 0, error 87; worker fails |
| 03:06:48.868 | Retained game HANDLE reports exit `0xc0000005`, generation 1 |

Seven successful writes and seven readbacks are recorded. The trace does not
identify what reset the integer to 60. It provides no evidence of a failed write
before the fatal read, but missing logging by other components cannot establish
that no other writes or mapping changes occurred. The operator's approximately
five-minute gameplay duration remains an estimate; process creation to the
exception is about four and a half minutes, and world-entry time was not logged.

The fatal thread is 284 (`0x11c`). RIP `0x14110c578` is game RVA `0x110c578` at
the recorded base `0x140000000`. The matching disk image has instruction bytes
`f3 0f 10 15 58 85 1a 04`: `movss xmm2,[rip+0x41a8558]`. This reads
`0x1452b4ad8` (RVA `0x52b4ad8`), 0x894 bytes after the FPS integer and on the
same 4 KiB page `0x1452b4000`. The bridge writes only the FPS integer's four bytes.
The dump contains registers, module mappings, 153 thread records and a 23,216-byte
fault-thread stack, but not the faulting code bytes/data page or a MemoryInfo
stream. The instruction attribution is to the matching on-disk image; no reliable
symbolized unwind or fault-time protection snapshot is claimed.

Error 87 is attributable to `read_memory` calling `ReadProcessMemory` with the
retained game HANDLE, the already-resolved integer address and size four. The old
code captured `GetLastError` immediately for diagnostics and preserved it across
logging; no intervening WinAPI explains a stale error on this FALSE-result path.
It is **not** evidence of an invalid target or initial scan address. The earlier
fatal exception strongly supports the failed read as a consequence of game
termination. A separate successful-but-short-transfer path could use stale last
error; this delivery normalizes that case to `ERROR_PARTIAL_COPY` (299), with the
raw return, byte count and captured API error retained.

Later nested exceptions at `libsystem_platform.dylib+0x33a0` occurred about 1.985
seconds after the fatal read; the owning processes of threads 0184/01b4 are not
bound. Keep these and the earlier separately observed Wine shutdown-thread abort
distinct from the primary gameplay fault.

## Historical comparison and ranked explanations

The legacy checkout was read through `git show b77fb00...:<path>` and path history,
including README, TESTING, SOURCE-PROVENANCE, release records and both correction
commits. Its existing modifications remain untouched. The deleted external
`automatic160-crash-analysis/revalidation-20260910` directory is absent; recovered
records identify reads at `0x1452b4244` and `0x1452b4ad8` and the CanvasRenderer
bounds context, but do not establish an exact historical RIP/byte match here.

1. **Wine post-write protection race — strongest.** The actual original `f26...`
   library reaches downstream `toggle_executable_pages_for_rosetta()` after
   `NtWriteVirtualMemory`. Allocation protection `0x80` classifies this currently
   `0x08` data page as executable and can transiently request `PAGE_NOACCESS`.
   A separately preserved earlier trace on this exact original runtime directly
   recorded NOACCESS/restoration APCs after a write to this page. This run adds
   the same-millisecond successful write/fatal read coupling. Its missing APC
   channels and fault-page snapshot prevent direct proof of this interleaving.
2. **Another mapping actor/game-state change — possible.** The current trace
   does not identify all protection changes. A protection/server trace or
   equivalent fault-time page evidence would distinguish this from the Wine
   mechanism; periodic bridge samples alone cannot catch every short interval.
3. **Worker address/operation failure initiated the crash — weak.** Initial
   resolution, seven successful writes/readbacks and the two-second ordering
   argue against error 87 initiating the fault. New diagnostics expose later
   mapping/partial-transfer/cancellation states without altering writes.
4. **Earlier Steam-root startup failure or Launch Fix — unsupported here.**
   Canonical Steam root, desktop preparation, actual game ownership and a running
   generation-1 worker are recorded. Launch Fix was off. Neither conclusion
   proves unrestricted compatibility for other runs/settings.

The revised signed candidate is SHA-256
`eef64f611ae9033261a70f46ec0be38d58823717f14e80331946c6d0cd3c85f7`.
It classifies current protection and skips this data page. Revision 1 beginning
`702394b6` was rejected and is not a deployment input. The existing independent
source/binary review package remains at
`/Users/david/Library/Application Support/YAAGL Local Builds/fps-direct-failure-20260913T204809Z/runtime-candidate`.
It is neither an installed correction nor current gameplay acceptance. Historical
README claims are not substituted for deployment/gameplay records. No historical
deployment/rollback script or candidate runtime was executed during this task.

## Cleanup confirmation and reporting correction

The current request logs workerDone 1, primary exit known, both game/Steam jobs
empty and shim exited at 03:06:48.966; `released=1` follows at 03:06:49.081.
Foreground Wine supervisor completion is confirmed at 03:06:49.138. The first
owned Wine wait completes at 03:06:53.086; registry restoration is acknowledged
at 03:06:54.305; the second Wine wait completes at 03:06:57.403. File-journal
restoration, journal removal and private resource removal precede the final
03:06:57.884 acknowledgement. The source only disposes the journal after its
restoration operations succeed. This is stronger than a vanished process or
successful command exit alone.

The live request/journal preimages were already absent when evidence was
preserved. Consequently **logged cleanup completion is confirmed; a new independent
byte comparison with this run's preimages is unavailable**. No force release,
protocol command, or extra Wine wait was issued during this task.

The repeated “Earlier cleanup errors” item came from the companion treating a
retained worker execution error returned by `stop()` as a cleanup error. The fix
keeps primary execution failures and additional execution observations separate
from rejected/unconfirmed cleanup or `cleanupError`. It preserves worker 87 and
game `0xc0000005`, and still states eventual cleanup completion. A production
transaction regression recreates the observed worker-first/game-exit sequence;
it failed before the correction and passes afterward. Real cleanup errors remain
visible and keep the existing recovery/ownership behavior.

## Candidate implementation and limits

The new protocol-3 bridge is 41,984 bytes, SHA-256
`59ae7f9e1b753499386cfe5336c9f4a4d911c39c69ce3447712c4522ccbe7c95`.
It captures API state immediately, adds retained-HANDLE exit/mapping probes after
failure, and records bounded five-second heartbeat counters and sampled mapping
changes. It introduces no delay, target ceiling/alias, manual arming or new memory
write. A sample can miss a transient protection change. Automatic worker startup,
canonical Steam as Wine's initial process, desktop preparation, ownership and
restoration safeguards remain.

The normal window stays hidden while native-backed retries and deadlines advance.
Solid installs the normal interface before the one-time native show; readiness
does not await a hidden paint or animation frame. The native watchdog and guarded
failure panel expose stalled/permanent startup failure, and cancellation drains
late sidecar acknowledgements before normal guarded quit. See
[the native bootstrap design](../native/bootstrap/README.md). Active native,
frontend, development override and package title paths are exactly **Yaagl OS**;
bundle identifiers, channels and profile/storage locations are preserved.
Initial startup restoration also reserves ownership before queueing and awaits
its final patch-state storage acknowledgement; an unhandled restoration failure
retains the guard. The matching owned2 ARM64 native is 2,034,736 bytes, SHA-256
`237dfcaf6039dd5ae506eb8603acbbcc0a400354f0af0ebfdb61fbe1d46a128b`.

Launch Fix keeps the saved choice for FPS off/on. The old detached privileged
script has been replaced by one retained foreground operation, with readiness
before game creation, matching completion/restoration acknowledgements, retained
evidence and cooperative cancellation. It retains a descriptor and in-memory
preimage, checks identity/exact after-image before restoration, refuses concurrent
edits, and retries only the same owned operation. Immutable inline helper source
is passed through quoted arguments; no elevated script is loaded from a writable
temporary file. Failures remain visible; unknown lifetime holds the guard.
Existing Steam/target/DXMT policy and the option's ten-second interval are preserved.
Timeout Fix remains separate. Unit/in-memory integration results do not establish
real-game Launch Fix compatibility or repair its historical compatibility issue.
Only the appended suffix is truncated after the exact after-image check. Status
reads are serialized and terminal validation reads again after foreground
completion; failed diagnostic publication retains the helper and only retries
publication automatically. The file lock is advisory: observed concurrent edits
are rejected, but a non-cooperating writer cannot be atomically excluded between
comparison and mutation. Owner/mode/inode are preserved; content timestamps change.

Portable C tests use inert Win32 mocks, ASan/UBSan and four rejected mutants;
bridge production rebuilds are deterministic and the Windows diagnostic fixture
cross-compiles. The reporting regression failed before and passed after. Launch
Fix tests use inert external boundaries and extracted in-memory hosts policy;
the actual helper received syntax checking only. Bootstrap tests freeze WebView
timers and model native time, retries, cancellation and one-time readiness.
With Node 16.20.2 and pnpm 7.33.7, **2,035 Vitest tests in 26 files passed**
(reported baseline 1,959), TypeScript and formatting passed, and lint retained
**nine existing warnings, zero errors**. Seven isolated evidence-collector tests
passed. Native compilation/signature verification, deterministic bridge
cross-compilation, C sanitizer/mutation checks and Perl syntax checks passed.
The full suite's external calls are inert shell/Perl fixtures, including extracted
in-memory Launch Fix policy/control; none starts the application or game.
Check output is under `checks/`, `analysis/native-checks-final/` and the bootstrap/
Launch Fix focused records in this evidence root. The packaging build compiles
the final Global frontend and records all static content/dependency checks under
`package/verification.json`. All application/runtime harnesses and actual
visual/gameplay/privileged checks remain deliberately unrun.

The fresh app is
`/Users/david/Library/Application Support/YAAGL Local Builds/fps-delayed-crash-20260914T031349Z/package/Yaagl OS.app`.
Its manifests bind the final committed source, frontend, ARM64 native runtime,
bridge/signed Steam pair, complete 19-file Sophon distribution and licenses.
The outer app is unsigned/not notarized; the native executable is ad-hoc signed.
Intel helpers require Rosetta. No Wine, private profile or game data is bundled.
The retained legacy xdelta helper still requires unavailable Intel
`/usr/local/opt/xz/lib/liblzma.5.dylib`; Sophon contents are statically verified,
but its health endpoint was not run in this task. The app uses the existing
separate review profile path without renaming it.

Follow only the new [manual checkpoint](../NEXT-MANUAL-CHECKPOINT.md). Building
this package is not a gameplay pass, and this task did not automatically execute
that checkpoint.
