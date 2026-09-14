# Autonomous packaged launcher and FPS validation — 2026-09-14

This investigation continues delivery `b7960f4429ef330d715e137d92e5a1098c61820b`. The user had not tested that delivery. The expanded request explicitly authorizes actual packaged launcher and real-game operation in separate profiles/runtime copies; the original provenance acceptance remains an unchanged prefix of the appended authorization record. Working activation, real host blocking and privileged network changes remain outside scope.

Evidence root: `/Users/david/Library/Application Support/YAAGL Local Builds/fps-autonomous-validation-20260914T130005Z` (abbreviated E below). `START.json`, the preserved request and authorization records establish the starting state. The initial checkout was clean and all510 files of the prior app matched its delivery manifest. Original logs, packages, profiles, installed/development Wine, dependencies and lockfiles remain preserved.

## Newly demonstrated launcher defects

Owned2 native `237dfcaf…` passed a short hidden retry fixture but stalled during permanent Sophon unavailability after three requests (~six seconds). Its native clock continued independently, but hidden WebKit stopped delivering JavaScript/RPC/close progress. Normal cleanup was not acknowledged. The isolated fixture had no permitted sidecar/Wine/game creation. A failed debugger recovery coincided with process exit; this is recorded as failed recovery, not normal cleanup. Its evidence is retained at `E/bootstrap-native-gG74wv`.

Commit `85afe7637ae1baddc525182db3fd865790462533` uses the public WebKit inactive-scheduling policy during hidden initialization and guarded failure/cancellation. It restores the previous policy after accepted readiness shows the window. It also removes upstream constructor ordering of a zero-size window. This requires macOS14+; the package minimum reflects that requirement. See [bootstrap details](../native/bootstrap/README.md).

All four real native fixtures pass with DOM timers/animation callbacks frozen: retry9.656s/four health requests, permanent failure30.556s/ten requests, delayed cancellation/veto10.813s, and watchdog95.099s total. Each acknowledges ordinary cleanup and exits0. The watchdog rejects late readiness using its90s elapsed deadline; visible notification arrived94.499s after arming, so exact90s presentation is not claimed. The configured-visible native-close fixture also passes, including concurrent foreground acknowledgements and normal-close veto.

The first real owned3 package opens with exact title Yaagl OS, hidden Sophon retries and a single normal window; both observed launcher-only instances exit0 through normal close, with their owned native/aria2/Sophon PIDs absent afterward. Individual Sophon exit status was not captured. Video review found a remaining presentation failure: three initial frames contain white content and the orange launch button before the background artwork. The sampled white interval is41.667ms and its transition bracket is75ms. This is distinct from the removed Starting Launcher placeholder. Full frames/timing are under `E/launcher-presentation-01/independent-review`. No game was launched during these presentation runs.

Source already awaited image load, but assigned src before handlers and did not await decoding. The subsequent artwork correction prepares the exact required rendered artwork under the native startup deadline; actual package video must establish whether it resolves this flash. Hidden paint/animation frames, off-screen/transparent window tricks and arbitrary delays are not readiness conditions.

## Wine candidate and delayed-crash lead

The preserved target150 crash remains the strongest original-runtime evidence: a seventh successful four-byte FPS write and the fatal read of another value on the same page share the same Wine millisecond. Error87 follows about two seconds later. No fault-time protection was captured, so the protection race is a strong lead rather than a proven reconstruction. The separately observed Wine shutdown-thread abort remains distinct. See [original delayed-crash evidence](fps-delayed-crash-investigation-20260914.md).

Fresh source/binary review uses the final historical R2 correction, not rejected R1. The original library hash is `f26ade35f5b49e33b3780b6adc71f9eb9c831ea40222c1bae667ac14135d984b`; R2 is `eef64f611ae9033261a70f46ec0be38d58823717f14e80331946c6d0cd3c85f7`. The 620688-byte x86_64 candidate retains its existing valid ad-hoc signature. Only13 code bytes and31 signature bytes differ; load commands match. Fresh offline regressions pass8003 assertions,300 above60 targets,64 protection pairs,20 modifier mappings and six negative mutations. R2 skips the executable-page toggle when current protection is non-executable; unchecked protection failures and independent mapping/lifetime races remain limitations.

`E/profiles/baseline/wine` and `E/profiles/candidate/wine` were independently copied from the existing FPS Review runtime and differ only in ntdll.so among11033 regular files. Prefix copies independently match the seed. The development-derived comparison copy has different winemetal resources and was preserved as unrun; it is not the selected test candidate. `E/profile-parity-audit` and `E/runtime-review` bind exact inputs/source/provenance. No historical deployment/rollback machinery was run, and no installed/development/original Wine was replaced.

The finite game plan is original-runtime disabled60, candidate enabled60 stable login, candidate120 for three minutes in-world, then candidate150 for ten minutes in-world with normal transitions. Existing evidence supports skipping another identical original150 attempt. Each prior run must finish with known lifetime, cleanup acknowledgements and independent restoration equality before advancing. Requested target, actual writes and observed FPS are separate results.

## Evidence integrity and remaining validation

Before a game run, `E/tools/run-preimages.py` captures and verifies28 launcher-controlled path states and two typed Mac Driver registry values. The new-byte request watcher retains changing journals/responses and native snapshots; journal coverage is independently audited. Final file/registry equality is compared only after confirmed Wine exit. Capture readiness, cleanup acknowledgements and restoration equality are separate claims. These evidence tools have12 inert regressions.

Commit `ec0958d` adds optional independent APFS descriptor clones for large full logs, with explicit source stability and clone failures; ten collector tests pass. It never falls back to a potentially storage-exhausting full byte copy. See [collector details](fps-evidence-collection.md).

Steam Patch stays ON, Launch Fix/block hosts OFF and Timeout Fix ON for actual crash tests. No host-blocking command or privileged network change is executed. Existing inert Launch Fix integration evidence remains separate from untested real-game compatibility. Complete Sophon resources are bundled; the existing Intel xdelta liblzma prerequisite remains unavailable, so legacy xdelta updates are limited. Outer packages remain unsigned/not notarized, with ARM64 native ad-hoc signatures and Intel helpers requiring Rosetta. A packaged app does not install the separate Wine correction.

## Completed observations and stopping point

The user requested wrap-up before candidate gameplay. No further game attempt was made. Original successful observations remain recorded; this task does not accept the delayed crash as fixed.

| Configuration | Observation | Worker / writes / FPS | Exit, cleanup and restoration |
| --- | --- | --- | --- |
| Final packaged launcher, original isolated profile | First visible frame already contains complete artwork; no white/partial frame in 52 dense samples. Exact title, hidden Sophon retries, settings persistence and normal quit verified. | No game during presentation checks. | Native exit0; owned aria2/Sophon PIDs subsequently absent. Individual Sophon exit status not captured. |
| Original Wine, FPS OFF, stored60 | Game created at13:51:12.588UTC; stable login observed from13:52:06.738. Normal visible quit confirmed at14:08:08.439. Desktop lock and operator interference extended this run; this is not continuous gameplay coverage. | No FPS worker expected. Numerical login HUD60.00; no in-world FPS or graphics/VSync inspection. | Request `MaEql3YNUp` cleanup acknowledgement14:08:14.607; native exit0 at14:09:17.626. All28 captured path states and both typed registry values independently match. Main Windows game PID/exit code were not directly captured. A shutdown nested-exception trace remains separate. |
| R2 Wine, enabled60 prepared | Package UI and saved settings verified; preimages and watcher ready. AX Launch action returned6 because no unique matching button was available. No Wine/game process or game log was created. User requested wrap-up before retry. | **Unrun; no worker/write/FPS pass.** | Normal Quit menu; native exit0 at14:15:43.873. aria2/Sophon subsequently absent. All28+2 preimages unchanged. |
| R2 Wine, enabled120 /150 | **Unrun.** | No real-game claim. | Not applicable. |
| R2 Wine, harmless direct / Steam bridge fixtures | Both completed using fresh fixture prefixes, never the actual game/prefix. | Targets1/60/61/120/360;120 write/readback with allocation80/current08 mismatch. | All9 direct and20 Steam requests released with empty jobs and workerDone1; Wine waits and fixture registry restoration passed. |

The final artwork evidence is `E/launcher-artwork-01/independent-review/review.json`. First visible frame652 at11.375s is complete; preceding frame651 at11.358333s is desktop. The largest adjacent video gap is33.334ms, so this is a finite captured observation, not proof that no shorter flash can ever occur. Commit `4e396b1cc4f2e1bc4637b8a44a75752ee9a71c57` supplies the decode/readiness correction.

The control's full22,323,920,394-byte Wine log is preserved as an independent stable APFS clone in `E/runs/original-disabled60/final-capture`, SHA-256 `83dbdc254588a9c60c93e47b50e566c9a22d61a28bda70f44230b8b7726dd64d`. Live request versions and preimages precede normal journal removal. Missing separate `.wine.log`/bridge/Steam streams for this disabled route are explicit; its main `.log` is the Wine stream. The package's configuration is inside resources.neu, rather than a loose profile neutralino.config.json. Profile-root DXMT logs were preserved separately. Handled SIGSYS/SEH traffic is not classified as a fatal game crash. The final nested exception on Wine's signal stack is retained as a shutdown finding; no connection to the earlier delayed gameplay fault is established.

The original log grew around21MB/s. At wrap-up approximately14GB remained available, insufficient for all remaining runs plus a ten-minute150 trace and video. No original was truncated, removed or compressed in place; logging verbosity and process creation were unchanged. The user was asked for additional storage before requesting wrap-up. The temporary idle-prevention assertion was ended; no security preference changed. No discovery/WM_CLOSE helper was executed: the control exited using the visible game power button and confirmation.

## Validation and deliverable

Pinned Node16.20.2/pnpm7.33.7: **2042 Vitest tests pass in27 files**, type/format checks pass, lint has the same nine warnings and zero errors. Ten collector regressions,12 isolated evidence-tool regressions, the owned-supervisor fixtures, portable memory diagnostics with sanitizers and four negative mutations,8003 Wine source assertions, the four native bootstrap fixtures and both R2 bridge suites pass. These are source/fixture results; enabled candidate gameplay, above60 gameplay, target150 sustained play and real Launch Fix compatibility remain unrun.

Actual final Global app: `E/package/Yaagl OS.app`, built from `4e396b1cc4f2e1bc4637b8a44a75752ee9a71c57`. Later report-only commits do not change its source/artifact binding. All511 packaged files,16 ASAR members,19 Sophon files, manifests, licenses, modes and identities were checked. macOS14+; ARM64 native, x64 bridge/Steam and Intel helpers requiring Rosetta. Native ad-hoc signature verifies; outer app is unsigned/not notarized. Existing xdelta's Intel liblzma dependency remains missing. Sophon health passed in the actual packaged UI.

| Artifact | SHA-256 |
| --- | --- |
| Native owned3 | `c67e7eabd572ca7c96dd1ab547a67faa0bac8e08e4fb50e95dd1850af6571939` |
| resources.neu | `99e6f56cccb348b7f23cdbbc78b0c1298c77ae393b403edcd9c430dae4753a4d` |
| Bridge protocol3,41984bytes | `59ae7f9e1b753499386cfe5336c9f4a4d911c39c69ce3447712c4522ccbe7c95` |
| Signed Steam64 shim | `0424339444c54bf1f9fdbadf12e4e2c90ceef41d987fe573b93f5f2ebfd8a657` |
| R2 ntdll.so,620688bytes | `eef64f611ae9033261a70f46ec0be38d58823717f14e80331946c6d0cd3c85f7` |

The exact fixture-tested Wine runtime is **`E/profiles/candidate/wine`**, with source/binary/provenance records in `E/runtime-review` and the strict baseline parity audit in `E/profile-parity-audit`. The earlier development-derived `E/runtime-candidate/wine` is a comparison copy, not the selected fixture runtime. Neither R2 copy has passed real-game testing. The app contains no Wine or private profile/game data and does not install R2. Its wrapper's default `Yaagl OS FPS Review owned3` profile was not the invocation used in these tests. Working installation activation remains outside authorization.
