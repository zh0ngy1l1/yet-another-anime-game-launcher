# Enabled-60 follow-up, September 13, 2026

The requested enabled-60 attempt **failed**. The game recorded protection-driver initialization failure, then exited with `0xc0000005` before any FPS worker generation started. Cleanup completed according to the launcher’s lifetime, supervisor, registry and journal records. A narrow correction now restores the enabled Steam shim’s canonical Windows image path, with verification of the actual prefix files and their C: mapping. The available evidence does **not** yet prove that this path difference caused the game failure or that the correction fixes real-game startup.

## Preserved identity and evidence

Investigation started from clean `fabffade23853bca948ede6832f49427c0d4de5e`, whose parent is `2d210438f949f4f2b9262bb0b01ee32953d80af8`. No existing edits were discarded. The earlier commits and [initial investigation](fps-prelogin-investigation-20260913.md), legacy checkout, archived Wine candidate, prior bundle and provenance authorization remain intact.

New evidence root:

`/Users/david/Library/Application Support/YAAGL Local Builds/enabled60-followup-20260913T171942Z`

`preservation-manifest.json` records stable full copies made before edits: launcher/game/Steam/Wine logs, both console captures, selected settings, bridge/shim/native/Wine identities and lockfiles. `additional-game-manifest.json`, `game-directory-logs/driverError.log`, crash inventories and `collector-current-complete/manifest.json` add the game-owned evidence. No protocol commands were written and no real game was operated by the agent. The collector's private evidence output is not part of the application bundle.

The operator attempt used:

- Development profile `yaaglwdos`, game `/Users/david/.gimpact`, Global 7.0.0 (executable 430,973,352 bytes, SHA-256 `a1a23cb76d941df28c5156ca3152fa49421ec98842221b7d71633d42ee76ca45`, unchanged from the prior investigation); FPS enabled **60**, Steam Patch **on**, Launch Fix/block hosts absent (effective **off**), timeout fix and Metal HUD on, DXMT **0.80.0**. The bridge creation log confirms game DXMT maximum **60**.
- Bridge protocol **3**, 37,888 bytes, SHA-256 `68023d90842e92dda9bbbda72f6ec30a83f7589f6d3d957f334c7c29b786bded`.
- Selected Wine `11.0-dxmt-signed-with-patches`; actual `wine/lib/wine/x86_64-unix/ntdll.so` SHA-256 `f26ade35f5b49e33b3780b6adc71f9eb9c831ea40222c1bae667ac14135d984b`.
- Request `3690786c530dd44ccfe86e4bbc2a55a27d5e0152a3feb43e51e88eacf063d8f1`, private directory `/tmp/yaagl-fps.2tZFRgzxw9`, game log `game_1789319336121.log`. That `.log` and `.steam.log` are empty; `.wine.log` is 7,266 bytes and contains the retained diagnostics.
- Console `/tmp/yaagl-enabled60-console.YiVmV8/terminal.log` contains this attempt. `/tmp/yaagl-enabled60-console.rAPYt9/terminal.log` contains a later UI restart, **not another game launch**. Its pnpm exit 255 is a separate launcher result, not the game’s Windows exception code.

The exact referenced owned-Wine directories are `GQX9TrGzKj`, `VzC5O2Makw` and `yugOtLkC7s` under `/tmp/yaagl-owned-wine.`. All four real request directories were already absent when inspected. Literal `XXXXXXXXXX` paths are creation templates, not run identities; the new collector excludes them and does not search old fixture directories as game evidence.

## Timeline

Times below are September 13 EDT (UTC minus four hours); bridge UTC timestamps and game-local/UTC timestamps agree.

| Time                | Evidence                                                                                                                                |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 13:07:43–46         | Two Sophon startup health retries.                                                                                                      |
| 13:07:55.891        | Successful game-info response: Global 7.0.0. The earlier startup retries did not prevent this launch transaction.                       |
| 13:08:56.392–57.379 | Registry snapshot execution and confirmed completion.                                                                                   |
| 13:09:02.348        | Protocol-3 bridge starts, Windows PID 32.                                                                                               |
| 13:09:02.800        | Signed shim ready: Windows shim PID 200, relay PID 208.                                                                                 |
| 13:09:02.859        | Game PID 224 created suspended with retained shim parent 200; assigned and resumed. Cwd is the repository root, game DXMT maximum 60.   |
| 13:09:02.984 onward | Primary game live, worker generation 0. MoltenVK initializes the adapter; no retained game DXMT initialization trace.                   |
| Wine tick 66479.420 | Service context validation reports insufficient access.                                                                                 |
| Wine tick 66479.724 | `WDFLDR.SYS` missing while loading `C:\windows\system32\HoYoKProtect.sys`; `ZwLoadDriver` for HoYoProtect returns `c0000142`.           |
| 13:09:11.849        | Game-owned `driverError.log`: `initDriver Failed: Error [4,1114,0].`                                                                    |
| 13:09:11.881        | Retained game handle records exit `0xc0000005`, generation 0.                                                                           |
| 13:09:12.059–12.062 | Sequence 32: game exit known, game job 0, Steam job 4, worker 0/done 1; launcher surfaces game failure.                                 |
| 13:09:12.401–13.065 | Shim exits; Steam job falls from 1 to 0.                                                                                                |
| 13:09:13.364–13.365 | Owned Wine confirms status 0; bridge release acknowledged at sequence 37. Successful supervisor exit is separate from failed game exit. |
| 13:09:16.363        | First owned Wine wait completes.                                                                                                        |
| 13:09:17.140        | Registry restoration execution confirms completion.                                                                                     |
| 13:09:20.245        | Second owned Wine wait completes.                                                                                                       |
| 13:09:20.958        | File journal restoration and private resource cleanup complete.                                                                         |

This is positive logged cleanup evidence, beyond the earlier operator observation. Removed snapshots prevent a fresh independent comparison of every restored byte with its pre-run original; that limitation remains explicit. No unresolved lifetime for this recorded request was found. A future unresolved request must retain its guard.

The process that failed was **GenshinImpact.exe**, not the FPS bridge. `0xc0000005` is an access-violation exit status. This attempt did not retain an exception instruction, accessed address, module-relative fault offset, thread stack, register/page snapshot or matching new macOS/game dump. Older prefix dumps date from September 9–11 and cannot supply this attempt's missing stack. The game-owned driver error is temporally correlated, but an exact driver-error-to-exception instruction chain was not captured.

Generation stayed 0 and the process exited about 9.0 seconds after resume, before the controller's existing ten-second initialization threshold. No signature resolution or target address exists for this attempt. The recorded controller/native state supports **no FPS worker start**, not a blanket claim that no component wrote memory. Missing write log lines alone would not establish that.

## Comparison and ranked explanations

1. **Current protection-driver startup failure, potentially affected by enabled creation context.** Both Wine and the game's own current log report driver initialization failure immediately before exit. This is the strongest present failure localization. Disabled Steam was operator-observed to reach the game; enabled 60 now also fails with the same game DXMT maximum 60. The bridge previously ran identical signed shim bytes under a private Z: image path instead of the disabled route's `C:\windows\system32\steam.exe`. The correction removes this verified path discrepancy. A stable operator retry with canonical-parent evidence would support its relevance; the same driver error/fault would leave other creation/runtime causes open.
2. **Other enabled creation differences or a common game/Wine protection-runtime incompatibility.** Canonical image path does not make the routes equivalent. The bridge still creates the game with the retained-parent attribute, explicit inherited output handles, suspended assignment and nested jobs; the shim directly creates the disabled game. The current game could fail even with canonical image identity. The next `.wine.log` adds `+seh` to obtain an exception instruction/stack if Wine emits it; handled first-chance exceptions alone are not fatal evidence. No driver, service, security checks or protection files were bypassed or changed as a purported solution.
3. **DXMT maximum 0 at target 120.** This is now a weaker necessary-cause explanation: the new enabled-60 game had maximum 60 and failed before retained game DXMT initialization. It does not rule out all graphics/runtime contributions. No target ceiling or special target case was added.
4. **The historical Rosetta page-protection write hazard.** The original selected `ntdll.so` still contains it, and the bridge worker's `WriteProcessMemory` can reach the downstream `NtWriteVirtualMemory` toggle. But this run never started that worker. The historical reads at game offsets `+0x52b4244` and `+0x52b4ad8`, faulting instructions `+0x161dff0` and `+0x110708e`, cannot be compared to a nonexistent current fault stack. The independently archived R2 candidate `eef64f611ae9033261a70f46ec0be38d58823717f14e80331946c6d0cd3c85f7` remains offline. Its source/binary and historical acceptance qualifications remain in the earlier report. No Wine library or signing/security metadata was altered.

The initial launcher reached Sophon successfully before the game transaction. The later UI restart retained two startup retry errors and no game-info/launch result before closing; the evidence does not establish why that launcher returned 255. No health check was weakened or arbitrary startup sleep added.

## Harmless creation-context comparison and correction

`creation-context-results.json`, `context-fixture.c` and `compare-creation-context.cjs` retain a four-arm comparison in an isolated prefix. All four fixtures exited 0; none ran the real game or an FPS worker.

| Property                                            | Direct canonical / private shim | Bridge private / canonical shim |
| --------------------------------------------------- | ------------------------------- | ------------------------------- |
| Child-visible parent image                          | C: system32 / private Z:        | private Z: / C: system32        |
| Cwd                                                 | Repository root                 | Repository root                 |
| DLL directory, desktop, title, selected environment | Same in this fixture            | Same in this fixture            |
| Job membership                                      | No                              | Yes; retained for ownership     |
| Startup flags                                       | 0                               | `STARTF_USESTDHANDLES` (256)    |
| Stdout type                                         | Character                       | Disk capture                    |
| Executable command line                             | Unquoted path                   | Quoted path                     |

The selected environment comparison covered DXMT, DLL overrides, SteamGameId absence, timeout fix and PATH. This does not reconstruct every inherited environment entry in the old manual disabled run. Likewise Unix process parentage can differ from Windows retained-parent identity. Neither fixture success nor Windows parentage proves Genshin equivalence.

`fps-bridge.ts` now verifies the journal-prepared system32 Steam/DLL files after setup and again before launch, using the existing exact size/SHA-256 and regular-file checks. `fps-steam.ts` verifies that `dosdevices/c:` resolves to the selected `drive_c`; redirected, missing or dangling mappings refuse execution. Native read handles keep the existing file-sharing restrictions through guarded completion. The private bridge/relay, authoritative game creation handle, job accounting, admission/close protection, health checks, initialization policy and restoration sequence remain intact. Native diagnostics log the retained shim's actual image. `+seh` is appended to the existing Wine debug configuration and retained in the already exclusive `.wine.log`, adding diagnostic overhead but no readiness delay.

New bridge protocol 3 remains 37,888 bytes, SHA-256 **`d7aa8ac472c5757f4d96847b626fe7b955e9ff6184940bc17b32f66c5900873d`**. The native runtime and signed Steam pair are unchanged. `scripts/collect-hk4e-launch-evidence.py` copies full logs, explicitly selected noncredential settings, current game driver log, game crash folders, timestamp-matched macOS reports and exact retained request directories into a new private output. It records source stability, hashes, missing files and symlinks without writing to sources or issuing process/protocol actions.

## Validation and operator gate

Node **16.20.2**, pnpm **7.33.7**. Full Vitest: **1,944 passed** (six additions to the prior 1,938). Focused launcher/controller/context checks: **76 passed**. Native direct and Steam bridge suites pass targets 1/60/61/120/360, explicit failure paths, worker restart, descendants, decoys and guarded release. Production native-RPC Steam fixtures pass ordinary completion, descendant retention, canonical image identity, and prepared-shim tamper rejection with exact original Steam/DLL restoration. Native close/concurrency and real/model supervisor regressions pass. Three evidence-collector filesystem regressions pass. Type checking passes; lint retains **nine existing warnings, zero errors**. Final formatting, diff, artifact and package records are retained in the evidence root's `checks` and `package` directories.

These are fixture results. Operator status remains: disabled pass reported, enabled 120 failed, enabled 60 **failed**, no accepted enabled-61 result, packaged game unrun. Follow [NEXT-MANUAL-CHECKPOINT.md](../NEXT-MANUAL-CHECKPOINT.md) for one controlled enabled-60 retry and automatic evidence collection. Do not install the offline Wine candidate, change targets or use the packaged review profile for this comparison. No Native Fullscreen or Game Mode work is included.
