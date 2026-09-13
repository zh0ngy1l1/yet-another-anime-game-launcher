# Canonical Steam enabled-60 failure, September 13, 2026

The canonical-path change did **not** fix the game crash. The new attempt records a game **write access violation to `0x1000`**, after protection-driver initialization failed and before any FPS worker started. Cleanup completed. A separate launcher bug incorrectly repeated the game error under “cleanup”; that reporting bug is corrected and tested. The cause of the game crash remains unresolved, and no game-runtime fix is claimed.

## Preserved run and timeline

Evidence root: `/Users/david/Library/Application Support/YAAGL Local Builds/canonical60-crash-20260913T181542Z`.

The checkout started clean at `3f2b53e0c2508f59e56d118783e5968669de8ccf`. Before edits, `preserved/manifest.json` captured full launcher/game/Steam/Wine/terminal logs, selected settings, game driver/crash files and exact retained request paths; 37 copied files were rehashed successfully. The operator's collections at `manual-evidence-20260913T141101-njf95brs/capture` and `manual-evidence-20260913T141448-ybpdtkfc/capture` independently contain this run. Their manifest identities are recorded in `operator-collector-correlation.json`. Earlier source commits, investigations, working modifications, evidence and app outputs are preserved.

Request: `649c1f37f3ced6288aa100a5d9a0f8decf5fc92175b49a9887d572ec0e8f309d`. Private request: `/tmp/yaagl-fps.IXLzVr8AQ4`. Run log: `game_1789322974126.log` (empty), adjacent `.steam.log` (empty), and `.wine.log` (11,218 bytes). Console: `/tmp/yaagl-fps-console.v9evD6/terminal.log`.

The selected development profile was `yaaglwdos`, Global game 7.0.0, FPS enabled at 60, Steam Patch on, Launch Fix/block hosts off, DXMT 0.80.0. Bridge protocol 3 was 37,888 bytes with SHA-256 `d7aa8ac472c5757f4d96847b626fe7b955e9ff6184940bc17b32f66c5900873d`. The selected actual Wine `ntdll.so` remained `f26ade35f5b49e33b3780b6adc71f9eb9c831ea40222c1bae667ac14135d984b`. Signed Steam resources and native runtime match the previous report. No Wine/game/security metadata was changed by this investigation.

Times below are September 13 EDT, UTC minus four hours.

| Time                | Recorded event                                                                                                                                    |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 14:09:11.892        | Sophon supplies Global 7.0.0 game info after initial startup retries.                                                                             |
| 14:09:34.372–35.258 | Registry save issued and owned execution confirmed.                                                                                               |
| 14:09:39.632        | Actual prepared system32 Steam pair and C: mapping verified.                                                                                      |
| 14:09:40.359        | Bridge Windows PID 32 starts.                                                                                                                     |
| 14:09:40.695        | Shim PID 200 / relay PID 208 ready; retained shim image is `C:\windows\system32\steam.exe`, query error 0.                                        |
| 14:09:40.754        | Game PID 224 created suspended, Windows parent 200, assigned and resumed; game DXMT maximum 60; cwd is repository root.                           |
| Wine tick 70108.948 | `RPC_S_SERVER_UNAVAILABLE` exception is handled/unwound. This is not the later fatal exception.                                                   |
| Wine tick 70117.474 | Game main thread `00e4` calls `GetModuleFileNameExA`, handle `0x130`, module NULL. The returned path and queried process identity are not logged. |
| Wine tick 70117.796 | `WDFLDR.SYS` dependency missing for `HoYoKProtect.sys`; HoYoProtect driver load returns `c0000142`.                                               |
| 14:09:49.896        | Game `driverError.log` reports `initDriver Failed: Error [4,1114,0]`.                                                                             |
| Wine tick 70117.825 | Thread `013c`: exception `c0000005`, write (`info[0]=1`) to `0x1000`, instruction pointer `0x6ffffd9b33d8`.                                       |
| 14:09:49.962        | Retained game handle reports exit `0xc0000005`, worker generation 0.                                                                              |
| 14:09:50.040        | Sequence 47: game exited, game job empty, shim exited, Steam job still 1.                                                                         |
| 14:09:51.228–51.347 | Steam job becomes empty; bridge release acknowledged at sequence 54.                                                                              |
| 14:09:51.407        | Foreground Wine supervisor confirms status 0. This is separate from the game failure.                                                             |
| 14:09:54.495        | First cleanup Wine wait completes.                                                                                                                |
| 14:09:55.387        | Registry restoration and owned execution confirmed.                                                                                               |
| 14:09:58.497        | Second cleanup Wine wait completes.                                                                                                               |
| 14:09:59.115        | Registry/file restoration and private resource cleanup completed.                                                                                 |

The UI's `cleanup: Error: ...game PID...` text was **not evidence of failed restoration**. Current source put observation failures in the cleanup-error array and displayed the same game failure twice. All actual lifetime/restoration gates completed for this request. Its request and owned-Wine directories (`EnDzBnJlkb`, `KZSlfDzyD3`, `ThulzwhTGc`) were already absent when inspected. No guard was force-released and no protocol commands were written to real requests. Removed snapshots still prevent independent comparison of every restored byte against its pre-run snapshot.

## Current exception versus legacy evidence

The current exception captures general registers, stack pointer `0x412df770`, and exception-handler traversal addresses. It does **not** capture stack memory, a call stack, instruction bytes, current module load map, or fault-time page protections. The four retained game dumps are September 10/11 artifacts, not this attempt. The 29 ms proximity between driver load failure and the access violation is strong temporal evidence, not a proven causal instruction chain.

Earlier dumps sometimes place MHYPBase.dll at `0x6ffffc230000`, which would make the current IP `MHYPBase+0x17833d8`; another dump uses a different base. The current file's PE timestamp/image size match those old module descriptors, but the current runtime mapping is unproven. At that hypothetical RVA the disk image lies in `.upx0` and does not decode to the captured write. Substituting those disk bytes or old load addresses would invent an instruction/module attribution. `exception-analysis/FINDINGS.md` and its metadata/disassembly explicitly retain these limits.

Read-only legacy recovery and scoped September 4–11 Codex transcripts found the remembered class of pre-login crash at targets 160 and 90. At cleanup parent `b77fb00af2d72aee0ef89473692b7f469de6715e`, `docs/releases/genshin-fps360-20260909.md` describes a **read** from game `+0x52b4244`, instruction `+0x161dff0`, with a recorded FPS write in the same second. The Wine correction `7552f9bb0a348df5400a8644e9374b345d3f5227` was revised by `0d703b464a76d33c1215c2fc53170e64c136e1f4`; revision 1 remains excluded. The validated offline R2 package and historical acceptance qualifications are preserved in the [initial investigation](fps-prelogin-investigation-20260913.md).

No retained legacy commit or local investigation matched the present write-to-`0x1000`/generation-0/driver-failure combination. This bounded negative search does not prove that no other unretained historical failure existed. The [legacy repository](https://github.com/zh0ngy1l1/yaagl-fpsunlock-gamemode-legacy) and recovered source show actual game creation delegated directly to the signed Steam shim, with a separate companion later. Similar symptoms do not establish the same mechanism. No historical deployment script was run and no Wine candidate installed.

## Tested explanations and remaining uncertainty

1. **Protection startup failure, potentially affected by the enabled creation context:** strongest present localization. The actual game error and exception immediately follow the driver load failure. A contemporary disabled control with the same game/Wine/settings will test whether this still depends on enabled creation. The last disabled pass was observed earlier, not during this attempt.
2. **Other common game/Wine/runtime conditions:** still possible if a fresh direct Steam control also fails. `WDFLDR.SYS` being absent alone does not prove which code path made it fatal. No driver replacement, security bypass or arbitrary runtime patch is justified.
3. **Canonical-parent image mismatch:** the new manual trace confirms canonical image identity but still fails. An independent harmless fixture compared the exact `GetModuleFileNameExA/W(NULL)` calls, QueryFullProcessImageNameW (Win32/native), and NtQueryInformationProcess classes 27/43 for self/parent with both limited and query/VM-read handles. All **18 results per route matched** between direct canonical Steam and bridge canonical Steam. This excludes that API discrepancy in the fixture, not every game-specific query.
4. **DXMT maximum 0 or this bridge's historical FPS write path:** neither explains a necessary trigger in this run. Maximum was 60 and worker generation remained zero. This says the bridge FPS worker did not start; it does not assert that all other components performed zero writes or that Wine has no other defects.

Actual creator/Unix parent, explicit inherited standard handles, startup flags, quoting and nested jobs still differ from the direct signed-shim route. No offline evidence singles one out. The signed shim retains its returned game handle privately; it offers no cooperative creation-handle transfer. Switching to job/PID or handle-table discovery would introduce a different identity design, not a small equivalent change. The feasibility review is saved in `signed-steam-creation-handle-feasibility.md`. No existing ownership/lifetime guarantee was relaxed to force startup.

## Supported correction and validation

`launch-transaction.ts` now separates launch/observation errors from actual cleanup-error history, deduplicates repeated observations, and emits **Cleanup completed** only after the existing lifetime/cleanup gates succeed. Genuine prior cleanup failures remain visible as earlier failures after safe retry. `LaunchFailure` preserves both histories through wrapping. Tests cover the exact duplicate pre-worker failure, the queue's final text, pending guarded stages, and genuine failed-then-recovered restoration.

`launch-diagnostics.ts` appends exception and module-load channels (`+seh,+loaddll`) consistently to both HK4E routes while preserving selected Wine debug settings. This supplies this run's module load addresses when Wine logs them; handled exceptions are not automatically failures. It adds logging overhead but no readiness delays, targets, arming modes, game-memory writes or process changes. The disabled route now explicitly logs its journal identity and successful cleanup. The read-only collector also recognizes exact `/tmp/yaagl-launch.<nonce>` disabled journals, excluding creation templates and unrelated fixtures.

Pinned Node 16.20.2 / pnpm 7.33.7: **1,947 Vitest tests**, **80 focused tests**, and three collector tests pass. Type/lint/format pass with the same nine existing lint warnings and zero errors. Native close/concurrency, real/model supervisor, bridge direct/Steam and production native-RPC completion/descendant/tamper cases are recorded under `checks`; the production fixture asserts that module-load records reach persistent `.wine.log`. These fixtures never execute game code. Package records are separate and do not establish game compatibility.

The next checkpoint is [one fresh disabled control](../NEXT-MANUAL-CHECKPOINT.md), with Steam Patch on, Launch Fix/block hosts off and all other settings unchanged. This is a discriminating diagnostic test, **not acceptance of a fixed enabled crash**. The tested implementation fixes reporting/evidence gaps; the real-game cause remains unresolved. Earlier disabled operator pass, both enabled-60 failures, enabled-120 failure, lack of an accepted enabled-61 result, and unrun packaged gameplay remain distinct. No Native Fullscreen or Game Mode work was done.
