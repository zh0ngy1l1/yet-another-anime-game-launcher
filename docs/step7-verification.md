# Step 7 implementation and evidence

The enabled direct HK4E development route now uses a source-built, target-bound FPS bridge. The implementation, deterministic checks, real harmless OS/Wine fixtures and native settings rendering were completed locally. **Real game execution, measured game FPS, provenance acceptance and packaged-app testing are not completed gates.** No real game or third-party unlocker was run against a game. Follow the [numbered Step 7.5 operator checklist](step-7.5.md), then stop before Step 8.

## Verified checkout and scope

- Checkout: `/Users/david/code/home/yaagl_vibecoding/yet-another-anime-game-launcher`.
- Starting HEAD: `3cf3e066b25e843809298db1601be92d58bc5ef6`; sole parent `482f216511b23cede620bfdffd5e4c654bc674dc`.
- Starting and unchanged `origin/main`: `514ebed106dc8c3b986a655d39d5bded8753941b`.
- Started on clean `main`, seven ahead/zero behind. The reported completed modules and prior commits were available and inspected. No applicable `AGENTS.md` was found. No canonical fetch, pull, reset, rebase, amend, cherry-pick or push was performed.
- Read-only legacy checkout: `/Users/david/code/home/legacy/yaagl-fpsunlock-gamemode-legacy`, HEAD `d48bd81bfcd64b337c92d2b53d0dacc3321a9b41`. The requested reference commits were locally available; the existing eleven modified legacy files were left untouched.
- Lockfile, dependency versions, `sophon_server/uv.lock`, `configure.sh`, `build-sophon.sh`, `neutralino.config.json`, `src/wine/distro.ts` and `build-app.js` remain unchanged against the starting HEAD. Package scripts only wire the local HK4E development resources/runtime. No installed launcher or Wine distribution was replaced.
- The prerequisite commit is `1c45c5886d0596063f20c54b9bcb2878f3f766cc` (`feat(hk4e): add target-bound FPS launch bridge`), parent `3cf3e066b25e843809298db1601be92d58bc5ef6`. The final integration commit is `feat(hk4e): launch FPS unlocker with owned cleanup`. Their exact IDs/parents are reported by the final handoff and `git log -2 --format='%H %P %s'`. All prior commits remain ancestors. No binaries, test profiles, crash reports or private protocol files are committed.

## Production mechanism and limits

The [source/build boundary](../native/fps-bridge/README.md) links the inspected Win32, Wine and upstream helper sources. `fps-admission.ts` snapshots validated persisted settings, the supported direct executable and selected Wine context before acquisition/mutation. A request token is only a protocol identity. `bridge.c` establishes process identity with `CreateProcessW` suspended, keeps its returned process handle, assigns an unnamed job with breakaway disabled, then resumes it. The FPS worker is a thread using that same retained handle. There is no process-name/foreground discovery, PID reopening, target fallback or adoption of a later incarnation.

Root exit stops FPS work. Win32 descendants, including the tested detached fixture child, keep the job nonempty and cleanup guarded. The bridge reports unsupported handoff and never retargets a child. Handoff through a pre-existing service, native Unix fork or another prefix is not covered. Current Genshin direct-entry behavior remains a live-game gate. An in-app lease does not coordinate external launchers using the same game files or Wine installation.

The Perl supervisor still owns/reaps only its direct Wine child. Bridge/job/thread completion, foreground-command completion, companion stop, request-owned Wine waiting, registry restoration and file restoration are distinct. Unknown lifetime or a timeout retains observation/admission and visible diagnostics. Cleanup errors retain originals and offer safe retry; they never authorize killing a running game, guessing ownership or releasing the guard. Force quit, launcher crashes, power loss and destruction of the private mailbox are not recovered guarantees.

Three local same-revision Neutralino patches are necessary and supported by actual probes: normal Cocoa Quit reaches the JS veto; approved exit runs on the AppKit main thread; foreground `os.execCommand` runs off the single RPC dispatch thread while retaining the original response ID. Without the last patch, a foreground request blocks its own mailbox RPCs. The supplied second crash report identified the AppKit violation in an earlier close probe. Both supplied reports remain untouched; later close fixtures exited normally.

The new bridge is protocol/artifact version 1, **28160 bytes**, SHA-256 **`28507fe29697ec4cde50c7bc9cb88a2a2d155cd9589c80bf65c81f248f090977`**. [The build record](../native/fps-bridge/build-record.json) records GCC 16.2.0, source hashes, flags and signature-source revision `56b9c64381ef9fd59e916dc9bf547d3210ab5db1` from `rishabhroyy/genshin-fps-unlock-universal`. MIT attribution is retained. A repeated local build matched; this is not cross-host reproducibility. The old v3.0.7 binary identity/provenance warning remains unchanged and that target-agnostic artifact is not selected by Step 7.

Execution uses a verified private mode-700 staging directory and its exact mode-400 artifact, checked before initial execution, registry utility execution and worker restarts. Same-user/administrator replacement between verification and loading remains possible. The implementation does not claim protection against that privilege level.

Enabled support is limited to direct Global/China HK4E with the admitted Wine 11 DXMT distributions and local native runtime `4.11.0-yaagl-owned1`. Enabled Steam and background privileged network blocking are rejected before side effects. Disabled launches retain upstream route/environment/FPS settings semantics, without FPS acquisition, verification or helper execution. Step 5 supplies all target/environment policy; controller defaults remain 90-second discovery, 10-second initialization and 5-second restart backoff, with no session timeout.

## Checks and evidence

Commands ran in the verified checkout. Node/pnpm commands used:

```sh
npm exec --yes --package=node@16.20.2 --package=pnpm@7.33.7 --call '<command listed below>'
```

The installed test runner resolved from the unchanged lockfile is Vitest 0.29.8. Counts describe executed assertions, not production guarantees.

| Command inside the pinned wrapper                                                                                                    | Result / evidence                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `node -v && pnpm -v`                                                                                                                 | `v16.20.2`, `7.33.7`                                                                                                                                                                                                                                     |
| `./configure.sh`                                                                                                                     | Passed; `.tmp/step7-configure.log`                                                                                                                                                                                                                       |
| `./build-sophon.sh`                                                                                                                  | Passed using isolated uv/Nuitka build; `sophon_server/build/server.dist/sophon-server`, 42,838,112 bytes; lock unchanged                                                                                                                                 |
| `node scripts/prepare-hk4e-dev.cjs`                                                                                                  | Local bridge/native resources built; no installation over the working runtime                                                                                                                                                                            |
| `node scripts/build-fps-bridge.cjs`                                                                                                  | Strict C build and recorded digest passed; `.tmp/step7-bridge-build.log`                                                                                                                                                                                 |
| `pnpm test`                                                                                                                          | **1,890 passed / 16 files**; verified baseline was 1,805; `.tmp/step7-vitest-full.log`                                                                                                                                                                   |
| Focused eight-file command in `.tmp/step7-focused-final.log`                                                                         | **120 passed / 8 files**, covering admission, actual controller/bridge adapter, transaction, generator/queue/close, journal and owned waits                                                                                                              |
| `pnpm exec tsc`                                                                                                                      | Passed; `.tmp/step7-types.log`                                                                                                                                                                                                                           |
| `pnpm run lint`                                                                                                                      | Passed: **zero errors, nine existing warnings**; `.tmp/step7-lint.log`                                                                                                                                                                                   |
| `pnpm run format-check`                                                                                                              | Passed; `.tmp/step7-format.log`                                                                                                                                                                                                                          |
| `node scripts/test-owned-execution.cjs`                                                                                              | Real OS children: natural exit, cancellation, TERM/KILL of unreaped direct child, decoy untouched; `.tmp/step7-real-supervisor.log`                                                                                                                      |
| `node scripts/test-native-close.cjs`                                                                                                 | Real concurrent foreground RPCs, separate results, mailbox access, normal-quit veto and approved exit 0; `.tmp/step7-native-close.log`                                                                                                                   |
| `FPS_TEST_WINE="/Users/david/Library/Application Support/Yaagl OS/wine/bin/wine" node scripts/test-fps-bridge.cjs`                   | Real harmless Wine fixtures: targets 1/60/61/120/360, decoy isolation, wrong/stale protocol, restart/stop, detached job lifetime/no retarget, missing/ambiguous signature and launch failure, exact registry restoration; `.tmp/step7-wine-fixtures.log` |
| `pnpm exec vite build --mode=development --config scripts/runtime-fixture.config.ts`                                                 | Passed; `.tmp/runtime-fixture-build.log`                                                                                                                                                                                                                 |
| `FPS_TEST_WINE="/Users/david/Library/Application Support/Yaagl OS/wine/bin/wine" node scripts/test-runtime-fixture.cjs --no-handoff` | Full production IO/controller boundary through actual WebKit/Native/Wine: successful lifecycle; `.tmp/runtime-fixture-webkit-success.log`                                                                                                                |
| Same command without `--no-handoff`                                                                                                  | Actual descendant handoff stays guarded, never retargets, then restores safely with expected failure; `.tmp/runtime-fixture-webkit-handoff.log`                                                                                                          |
| Same commands with `--rpc`                                                                                                           | Same transaction/client in a Node VM against real Native/Wine; success and handoff evidence in `.tmp/runtime-fixture-rpc-success.log` and `.tmp/runtime-fixture-rpc-final.log`; not visual evidence                                                      |
| `pnpm exec vite build --mode=development --config scripts/ui-fixture.config.ts` and `node scripts/test-settings-ui.cjs`              | Actual launcher/shared settings/Hope controls and private native storage passed for both channels; `.tmp/ui-verification-final.log`                                                                                                                      |

Also passed: `/usr/bin/perl -c src/wine/owned-execution.pl`; `/usr/bin/perl src/wine/owned-execution.t` (**eight simulated cases / 24 assertions**, `.tmp/step7-perl.log`); CJS syntax checks for every added script; Python build-script syntax; formatting of new scripts/docs/JSON; Git diff whitespace checks. The Perl cases substitute fork/wait/signal operations; the separate real OS fixture actually forks, signals and reaps harmless children. Vitest's journal fixtures use real temporary files with injected filesystem operations; controller/native-boundary tests use deterministic promises, not a real game observer. Native/Wine fixtures complement those simulations.

The combined regressions individually hold helper completion, Wine wait and restoration pending after actual game exit; normal close and duplicate admission remain blocked until all finish. The unconfirmed cleanup case remains visibly failed and guarded. Tests also cover artifact changes before spawn/restart, preparation/acquisition failure, stale identity/PID changes, late spawns, generator return and primary/secondary errors. Kernel PID reuse was not forced: retained process handles avoid reopening by number, and injected reuse plus decoy fixtures exercise rejection/no-retarget behavior.

## Rendered settings and environment

Final screenshots were captured from the actual native windows and visually inspected:

- [Global](../.tmp/ui-verification/hk4e_global-3mJdb4/settings-game.png).
- [China](../.tmp/ui-verification/hk4e_cn-g2zbSl/settings-game.png).

Both show **Enable unlocking** and **Target FPS** under Settings → Game. The driver checks DOM label associations, edits, immediate persistence, invalid enabled input rejection before admission, retained target text, reopening and native restart. Storage byte/hash/mtime snapshots show no FPS writes on open/dismiss or restart without edits. Saved `061` remains text while admission produces numeric 61; disabled invalid `0` is retained; saved 120 survives restart and feeds the Step 5 plan. Each profile's `verified-state.json` and the combined `results.json` retain evidence. Presentation controls were not replaced. Channel/network/Wine operations are forbidden in this UI fixture, so it does not establish full game/bootstrap compatibility.

Host: Mac16,1 arm64, macOS 26.6.2 (25G83); unchanged existing Wine 11.0 at `/Users/david/Library/Application Support/Yaagl OS/wine/bin/wine`. Native local compiler was Apple clang 21.0.0 (`clang-2100.1.1.101`), Python 3.13.14; exact native recipe/source/binary hashes are in `bin/hk4e-neutralino-arm64.json`. The built native SHA-256 was `3e04ed4a6d2b5389d7dbe525367881a08a5081314ef6dddf973227a66a3857e1`.

Earlier WebKit runtime attempts were blocked while the Mac was locked. After unlock both complete WebKit lifecycle cases and fresh UI persistence checks passed. The earlier private fixture processes exited cooperatively, their job/thread completion was verified, private Wine waits completed and dummy files were restored; diagnostic directories remain as evidence. Their suspended UI-only windows were closed only after that harmless-fixture cleanup. The final fixtures exited normally. No real game, unrelated process, installed Wine prefix or shared wineserver was terminated.

## Remaining manual gates

Real Global/China game cases remain **not run**, pending provenance acceptance and explicit authorization. China requires an existing China game/profile; it was not present here. Initial smoke targets are 60, 61 and 120; optional 180/200 depend on hardware. The synthetic 360 test only writes an integer in a harmless process, consumes no real game rendering workload and does not prove achievable 360 FPS. Packaged-app behavior remains a separate gate after Step 8. Use the complete [Step 7.5 checklist](step-7.5.md).

## Changed files

The following source/build/test/documentation files belong to this task. Generated binaries, logs, screenshots and private profiles are ignored local evidence.

- `.gitignore`
- `docs/step-7.5.md`
- `docs/step7-verification.md`
- `native/fps-bridge/LICENSE.upstream`
- `native/fps-bridge/README.md`
- `native/fps-bridge/bridge.c`
- `native/fps-bridge/build-record.json`
- `native/fps-bridge/fixture.c`
- `native/fps-bridge/registry.c`
- `package.json`
- `scripts/build-fps-bridge.cjs`
- `scripts/build-hk4e-native.py`
- `scripts/prepare-hk4e-dev.cjs`
- `scripts/run-hk4e.cjs`
- `scripts/runtime-fixture.config.ts`
- `scripts/runtime-fixture.html`
- `scripts/runtime-fixture.ts`
- `scripts/test-fps-bridge.cjs`
- `scripts/test-native-close.cjs`
- `scripts/test-owned-execution.cjs`
- `scripts/test-runtime-fixture.cjs`
- `scripts/test-settings-ui.cjs`
- `scripts/ui-fixture.config.ts`
- `scripts/ui-fixture.html`
- `scripts/ui-fixture.tsx`
- `src/app.tsx`
- `src/clients/mhy/hk4e/config/fps-unlock-settings.ts`
- `src/clients/mhy/hk4e/config/fps-unlock-state.ts`
- `src/clients/mhy/hk4e/config/fps-unlock-ui.spec.ts`
- `src/clients/mhy/hk4e/config/fps-unlock.tsx`
- `src/clients/mhy/hk4e/fps-admission.spec.ts`
- `src/clients/mhy/hk4e/fps-admission.ts`
- `src/clients/mhy/hk4e/fps-bridge-manifest.ts`
- `src/clients/mhy/hk4e/fps-bridge.ts`
- `src/clients/mhy/hk4e/fps-companion.ts`
- `src/clients/mhy/hk4e/fps-integration-fixture.ts`
- `src/clients/mhy/hk4e/fps-integration.spec.ts`
- `src/clients/mhy/hk4e/fps-unlocker.ts`
- `src/clients/mhy/hk4e/index.tsx`
- `src/clients/mhy/hk4e/launch-fps-game.spec.ts`
- `src/clients/mhy/hk4e/launch-fps-game.ts`
- `src/clients/mhy/hk4e/launch-journal.spec.ts`
- `src/clients/mhy/hk4e/launch-journal.ts`
- `src/clients/mhy/hk4e/launch-transaction.ts`
- `src/clients/mhy/hk4e/program-launch-game.spec.ts`
- `src/clients/mhy/hk4e/program-launch-game.ts`
- `src/clients/mhy/hk4e/settings.tsx`
- `src/clients/mhy/patch.ts`
- `src/config/index.tsx`
- `src/downloadable-resource.ts`
- `src/launcher/index.tsx`
- `src/launcher/launch-ownership.spec.ts`
- `src/launcher/launch-ownership.ts`
- `src/launcher/task-queue.ts`
- `src/locale/de_DE.ts`
- `src/locale/en.ts`
- `src/locale/es_ES.ts`
- `src/locale/fr_FR.ts`
- `src/locale/ja_JP.ts`
- `src/locale/ko_KR.ts`
- `src/locale/ru_RU.ts`
- `src/locale/th_TH.ts`
- `src/locale/vi_VN.ts`
- `src/locale/zh_CN.ts`
- `src/utils/neu.ts`
- `src/wine/owned-execution.md`
- `src/wine/owned-execution.spec.ts`
- `src/wine/owned-execution.ts`
- `src/wine/wait-until-server-off.spec.ts`
- `src/wine/wine.ts`
