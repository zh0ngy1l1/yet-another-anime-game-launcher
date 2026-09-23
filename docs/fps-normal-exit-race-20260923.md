# FPS worker shutdown classification — 2026-09-23

Starting revision: `69cdb20`. This change is confined to FPS lifecycle classification, diagnostics, build identity, regression fixtures, and this report. No updater or installed-app/profile change.

## Finding

The normal Option+Command+Q shutdown races the FPS worker's `ReadProcessMemory`. **The game HANDLE can still be unsignaled after the memory failure.** A post-failure HANDLE check alone does not fix the observed case. Wine's native memory query supplies the missing authoritative state: `STATUS_PROCESS_IS_TERMINATING` (`0xc000010a`) before the HANDLE signals. Win32 `VirtualQueryEx` loses this distinction by mapping it to `ERROR_ACCESS_DENIED` (5).

The preserved original run establishes a shutdown-correlated read failure and subsequent successful exit, but did not record the native query status. The live reproduction with enhanced diagnostics establishes the terminating status at that same failure boundary. We do not retrospectively claim that the old probe recorded a signaled HANDLE or a native status it did not contain.

## Original failing run

Read-only investigation used the latest private-profile logs, `/tmp/yaagl-710-manual-20260923-083720`, and its guard record. Copies are preserved in `/tmp/yaagl-fps-shutdown-20260923/before`. Bridge stream: `game_1790167095499.log.bridge.log`; corresponding Wine stream and `neutralinojs.log`. Token `9780afac1cb0b372dfc743dc5ff9a0b5008c5944feefd80609111594d875d29b`, generation 1, Windows game PID 280, bridge PID 200, worker thread 572. PID values identify log records only; all runtime observations use the retained HANDLE.

Times below are UTC on September 23. Neutralino's local timestamps are EDT (UTC−4).

| UTC | Observation |
| --- | --- |
| 12:38:38.551 | Worker scanning, target 150. |
| 12:38:38.895 | Applying at `0x1454cc60c`. |
| 12:38:38.896 / 12:38:39.096 | First successful 4-byte write and readback of 150. |
| 13:55:27.345 / 13:55:27.546 | Last individually logged successful write and changed-value readback of 150. Equal reads are counted, not individually logged. |
| 13:57:46.620 | Last periodic heartbeat: 23,726 reads, all successful; 36/36 writes; no mapping changes. |
| Before 13:57:48.223 | Loop's zero-time HANDLE/stop wait returned timeout, otherwise the failing transfer cannot execute. The exact wait timestamp is not logged. |
| 13:57:48.223 | `ReadProcessMemory`, address unchanged, requested 4, transferred 0, `apiOk=0`, `apiError=87`, normalized `error=87`. No failing write. |
| 13:57:48.223 | Failure probe: `wait=0x102` (timeout), `exitQueryOk=1`, `exitKnown=0`, `exitCode=0x103` (STILL_ACTIVE); `VirtualQueryEx` returned zero bytes/error 5. |
| 13:57:48.223 | Old worker unconditionally publishes failure. Final heartbeat: 23,734 attempts, 23,733 successful reads, 36 successful writes, 23,697 equal observations. Last successful equal-read timestamp is not individually retained. |
| 13:57:48.392 | Protocol sequence 41013: worker state 4, done 1, workerError 87, primaryExited 0; game job active 8. |
| 13:57:48.692 | Bridge observes retained game exit, code `0x00000000` (469 ms after failed read). |
| 13:57:48.808 | Sequence 41016: primaryExited 1, exitCodeKnown 1/code 0, both jobs empty, shim exited, workerError still 87. |
| 13:57:49.071 | Sequence 41018: bridge release confirmed. |
| 13:57:49.146 | Foreground Wine execution confirmed, status 0. |
| 13:57:53.114 | First request-owned wineserver wait completed. |
| 13:57:54.156 | Registry restoration and owned execution confirmed. |
| 13:57:57.258 | Post-restoration wineserver wait completed. |
| 13:57:58.968 / .986 | Private runtime cleanup, then complete registry/file/private-resource cleanup confirmed. |

The old bridge does not log stop commands. No stop request before the failed read is established; the worker had already ended before cleanup. The user supplied the final UI text, `Launch finished with errors: Error: FPS target scan/write failed: 87. Cleanup completed.` It is not independently timestamped in the retained streams. Its construction follows directly from `spawnWorker()` converting workerError into an execution failure and the companion/transaction preserving that primary failure through successful cleanup. The manual guard records launcher exit 0 and unchanged original inventory.

Answers to the lifecycle questions: target discovery and gameplay read/write success are established; the pre-read wait was unsignaled by the executed code path; completed process exit between that wait and the read is **not** established (the post-read wait was also unsignaled). Termination in progress is confirmed by the subsequent reproduction. Original exit code was normal, cleanup succeeded, and the reproduced memory error occurs during intentional shutdown rather than the preceding ordinary gameplay. We do not generalize every error 87 to shutdown.

## Error definitions and runtime mechanism

The selected MinGW platform header, `/opt/homebrew/opt/mingw-w64/toolchain-x86_64/x86_64-w64-mingw32/include/winerror.h`, defines `ERROR_INVALID_PARAMETER` as 87; `ntstatus.h` defines `STATUS_PROCESS_IS_TERMINATING` as `0xc000010a`. A harmless executable against the selected private Wine also verified `FormatMessage(87) = "Invalid parameter."`, `RtlNtStatusToDosError(0xc000000d) = 87`, and `RtlNtStatusToDosError(0xc000010a) = 5`; source, executable, and output are retained as `error-definitions.*` in the evidence root. The production helper captures `GetLastError` immediately after `ReadProcessMemory`, before any logging/probe. The logged 87 is the API failure, not stale diagnostic state or short-transfer normalization.

Wine 11.0 source explains the platform behavior: [Mach memory reads](https://github.com/wine-mirror/wine/blob/wine-11.0/server/mach.c) call `mach_vm_read_overwrite`; `KERN_INVALID_ARGUMENT` maps to `STATUS_INVALID_PARAMETER`. [Native-to-Win32 mappings](https://github.com/wine-mirror/wine/blob/wine-11.0/dlls/ntdll/error.h) map that status to 87 and process-terminating to 5. [Native virtual-memory queries](https://github.com/wine-mirror/wine/blob/wine-11.0/dlls/ntdll/unix/virtual.c) use a remote query APC; [server APC handling](https://github.com/wine-mirror/wine/blob/wine-11.0/server/thread.c) returns process-terminating when it cannot queue into the dying process. This explains why the existing Win32-only queryError 5 was ambiguous. The exact underlying Mach return in the old run was not logged, so its derivation is source-based, not a claimed Mach trace.

## Change and scan audit

`bridge.c` exposes a read-only, dynamically resolved `NtQueryVirtualMemory` query against the retained owned game HANDLE. `memory-diagnostics.c` records its native status alongside the existing API error, Win32 query, wait and exit evidence. `MemoryTransfer` carries only the explicit terminating observation into classification; original error values remain intact.

`worker.c` contains the existing worker plus one shared failure classifier. After unsuccessful address resolution or a recurring read/write, it rechecks worker_stop and game HANDLE. A signaled stop, signaled game, or explicit native process-terminating status produces state 3/workerError 0. Otherwise it preserves FAILED and the error (scan miss remains ERROR_NOT_FOUND). Diagnostic persistence failure remains independently fatal. No sleep, retry of a failed write, process-name lookup, PID reopening, ownership change, error-number exemption, or later-exit suppression is added.

Any final resolution failure from module inspection, PE/header reads, section/signature scanning, or candidate resolution returns through the same scan-failure boundary. Successful resolution followed by exit reaches the worker's existing retained-HANDLE wait. The recurring transfer failure uses the native status already captured by its failure probe. The scan boundary queries the same retained HANDLE if neither wait establishes termination. An unavailable query or generic access denial cannot authorize clean completion.

TypeScript production behavior is intentionally unchanged: an actual workerError is still an error, including when a later game exit is zero. `fps-companion.ts` correctly retains execution errors during stop; `launch-fps-game.ts` separately retains process-exit/cleanup failures; `program-launch-game.ts` consumes the transaction result. These layers have no failure-time evidence to reinterpret an old native error safely. Correct native semantics avoid a broad TypeScript suppression. Abnormal game exit remains separately visible even when the worker stops cleanly because the process is dying.

## Regression validation

- `node scripts/test-fps-memory.cjs`: production helper under ASan/UBSan, immediate API error capture, successful-short normalization, exact native termination evidence, Win32 probes/counters; four deliberate mutations rejected.
- `node scripts/test-fps-worker.cjs`: actual production worker with inert deterministic API scheduling. Live read and write error 87 stay FAILED; explicit stop and game exit during read/write become clean; native terminating state before signaling becomes clean; ordinary access-denied is not termination; genuine scan miss and diagnostic failure remain visible.
- `worker-scan-fixture.c`: actual compiled PE scanner against its own harmless image. Each of 25 header/section/signature/candidate reads is failed in turn, then recurring read and write, with a live target, simulated signaled retained HANDLE, and explicit stop. No process is killed. All cases pass.
- `scripts/test-fps-bridge.cjs` direct and `--steam`: ownership, decoy, restart/stop, detached jobs, protocol, logging, registry, Steam handoff and abnormal-exit regressions retained. New `memory-error` fixture first reaches FPS 120, then marks only its dedicated FPS page PAGE_NOACCESS while continuing to run. Actual ReadProcessMemory returns 998; query succeeds with PAGE_NOACCESS and no terminating status. The bridge publishes workerState 4/workerError 998/primaryExited 0. Cooperative fixture exit later returns 0 and does not clear the failure.
- TypeScript launcher tests exercise both 87 and the real fixture's 998 against a live target, then successful game exit and cleanup: launch completion still reports the FPS failure. Clean native termination plus normal exit returns no launch failure; abnormal exit remains reported. Existing cleanup-failure/retry tests remain unchanged.

Live-failure evidence: `/var/folders/nn/34wh2q094x5f5qrtj4n8c76r0000gn/T/yaagl-bridge-fixture-AbtsAh/memory-error/{live-failure-status.json,game.log.bridge.log}`. At 22:46:29.649 UTC the failure classification is `reason=live-target-failure`, native query status 0, workerError 998, primaryExited 0. This independently distinguishes live memory protection failure from shutdown.

## Isolated live validation

Evidence root: `/tmp/yaagl-fps-shutdown-20260923`. Only the authorized clone and private profile were used. The existing guard denies original-game reads/writes and installed-profile/app writes in the launcher and all descendants; all seven guard regressions pass. Each launcher starts through `guard-hk4e-clone-launch.py`; game starts through its normal Launch Game button with Steam Patch/R2 and target 150. No new game launch mechanism or forced process termination. Normal quit uses the user's Option+Command+Q keyboard gesture.

Run 1 reached the authenticated world with visible DXMT rendering and character movement. At 22:45:11.754, its read failed with 87 while both waits remained timeout and GetExitCodeProcess reported STILL_ACTIVE. **Native query status was `0xc000010a`**, worker classification `process-terminating`; error stayed diagnostic only. Game exit 0 was observed at 22:45:11.993. Full cleanup completed at 22:45:22.026. UI returned to enabled Launch Game with no error. Launcher exited 0; original inventory unchanged. This directly reproduces the shutdown race rather than merely hiding a UI message.

The first run used bridge `143a8287e54fe64015dcb58d0e8ed3489d63408e0a087c6485871af1662aeeba`. A subsequent diagnostic-only correction carries the already-observed native status into the classification log instead of displaying zero for the skipped second query. Final bridge identity is in `build-record.json`; subsequent runs use that artifact. Frontend builds pass with the existing bundle-size and unbundled Neutralino-script warnings.

All three runs reached the authenticated world and reproduced the racing read failure. Run 1 includes a short movement check; runs 2–3 verify world rendering and continued FPS operation without additional gameplay interactions. These are focused shutdown checks, not a new broad gameplay certification.

| Run / log basename | Successful reads / writes before final failed read | Failed read UTC | Game exit 0 UTC | Full cleanup UTC |
| --- | --- | --- | --- | --- |
| 1 / `game_1790203386846.log` | 508 / 4 | 22:45:11.754 | 22:45:11.993 | 22:45:22.026 |
| 2 / `game_1790203613933.log` | 1,414 / 4 | 22:51:59.922 | 22:52:00.234 | 22:52:10.135 |
| 3 / `game_1790203962895.log` | 607 / 5 | 22:55:07.500 | 22:55:07.675 | 22:55:17.499 |

Each failure probe shows `apiError=87 error=87`, `wait=0x102`, `exitCode=0x103`, and `queryStatus=0xc000010a terminating=1`. Each classifier reports `reason=process-terminating`; all observed protocol statuses retain workerError 0. Final statuses confirm worker state 3/done 1, known game exit 0, both jobs empty, and bridge released. The launcher returned to its enabled Launch Game action without an error panel. `live-results.json` preserves the probes, final counters, exact exit/cleanup lines and terminal protocol statuses; `after/` preserves streams. Both guarded launcher sessions exited 0 and recorded unchanged original inventories (the second launcher session hosted runs 2 and 3).

Final bridge SHA-256: `2967420a6b5689da0e311ef2001c9c541843e18cb27bbc3ff0a22b5649629b23`, 43,008 bytes. Both later runs used it, and a repeat build reproduces this hash. The private frontend manifest pins the same artifact. The original installed app/profile were protected and not deployed to.

Post-run checks confirm all three request directories and all temporary R2 runtime directories are gone. MD5 checks on the restored canonical `upload_crash.exe`, `Plugins/crashreport.exe` and `Plugins/vulkan-1.dll` match the independently verified 7.1.0 targets listed in the runtime report; see `restored-assets.json`. No full game rehash or manual game/cache repair was performed.

## Final checks and file inventory

All 1,837 tests in the ten FPS/config/companion/runtime/integration/launcher suites pass. `tsc --noEmit`, ESLint on changed TypeScript, Prettier checks, and `git diff --check` pass. Both complete native fixture routes pass on the final bridge with the actual scan fixture included; results are in `native-direct-final.txt` and `native-steam-final.txt`. Their evidence directories are respectively `/var/folders/nn/34wh2q094x5f5qrtj4n8c76r0000gn/T/yaagl-bridge-fixture-Yq3llA` and `.../yaagl-bridge-fixture-HMbrJF`. The portable ASan/UBSan tests also pass. The genuine live-target error 998 and unrelated live-target error 87 both remain launch failures through confirmed cleanup in TypeScript regression coverage.

Modified/added files:

- Production: `native/fps-bridge/bridge.c`, `worker.c`, `memory-diagnostics.c`.
- Build identity: `scripts/build-fps-bridge.cjs`, `native/fps-bridge/build-record.json`, `src/clients/mhy/hk4e/fps-bridge-manifest.ts`.
- Native tests: `native/fps-bridge/fixture.c`, `memory-diagnostics-portable-test.c`, `worker-portable-test.c`, `worker-scan-fixture.c`, `scripts/test-fps-worker.cjs`, `scripts/test-fps-bridge.cjs`.
- TypeScript regression: `src/clients/mhy/hk4e/launch-fps-game.spec.ts`.
- Documentation: this report, `native/fps-bridge/README.md`, and the separate authenticated-evidence addendum in `docs/genshin-runtime-validation-20260922.md`.

Reproduction commands (run from the repository root):

```sh
node scripts/build-fps-bridge.cjs
node scripts/test-fps-memory.cjs
node scripts/test-fps-worker.cjs
FPS_TEST_WINE='/Users/david/Library/Application Support/YAAGL Runtime Validation/20260922/profile/wine/bin/wine' node scripts/test-fps-bridge.cjs
FPS_TEST_WINE='/Users/david/Library/Application Support/YAAGL Runtime Validation/20260922/profile/wine/bin/wine' node scripts/test-fps-bridge.cjs --steam
./node_modules/.bin/vitest run src/clients/mhy/hk4e/fps-*.spec.ts src/clients/mhy/hk4e/launch-fps-game.spec.ts src/clients/mhy/hk4e/config/fps-*.spec.ts --threads=false
```

The fix does not infer normal game exit from the NT termination result. It ends memory work safely, then retains the existing independent game-exit-code, job, foreground execution, restoration, and cleanup checks. A crash can therefore end the worker cleanly while still failing the overall launch; a live memory failure cannot be erased by an eventual normal exit.
