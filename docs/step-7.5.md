# Step 7.5 operator checklist — development mode only

Record every case as **passed, failed, not run, or blocked**, with timestamp, observations and evidence. Real-game cases in this implementation handoff are **not run**: provenance acceptance and authorization to execute against the real game remain pending. Requested caps are not promised achieved frame rates. Do not force a 360 FPS run; initial smoke targets are 60, 61 and 120. Optional 180/200 runs depend on hardware headroom. Synthetic integer boundary tests at 1/360 do not establish performance at those frame rates.

1. **Preconditions, source and isolated development setup.** Record explicit acceptance of the third-party provenance limitations and authorization for real-game FPS testing in `.tmp/step7.5/authorization.txt`. Review [the source/build/ownership boundary](../native/fps-bridge/README.md). Use the existing unmodified Wine distribution; do not install over the working launcher or Wine. Close the working launcher/game normally first, and keep other launchers away from the same game/Wine files for these tests. Keep macOS unlocked while performing UI checks. If the development launcher offers **Install Wine**, a launcher update or **Update** instead of **Launch**, stop and mark the smoke case blocked; do not accept an installation/update as part of this checklist.

   All commands below run in:

   ```sh
   cd /Users/david/code/home/yaagl_vibecoding/yet-another-anime-game-launcher
   mkdir -p .tmp/step7.5
   npm exec --yes --package=node@16.20.2 --package=pnpm@7.33.7 --call 'node -v && pnpm -v'
   npm exec --yes --package=node@16.20.2 --package=pnpm@7.33.7 --call './configure.sh'
   npm exec --yes --package=node@16.20.2 --package=pnpm@7.33.7 --call './build-sophon.sh'
   npm exec --yes --package=node@16.20.2 --package=pnpm@7.33.7 --call 'node scripts/prepare-hk4e-dev.cjs'
   ```

   `build-sophon.sh` uses existing `uv`; its required output is `sophon_server/build/server.dist/sophon-server`. Local bridge preparation requires the existing MinGW GCC 16.2.0 toolchain; the native build uses Python 3.13.14 and Xcode command-line clang. These tools were already available here. Preparation verifies the bridge's recorded hash and builds only repository-local resources.

   The inspected Global working profile is `/Users/david/Library/Application Support/Yaagl OS`, with `wine_tag` equal to `11.0-dxmt-signed-with-patches`, and game directory `/Users/david/.gimpact`. The two development profiles initially had no Wine configuration. For the **Global** smoke test, make a separate copy while the source profile is closed. Stop and review if any destination already exists; this block refuses to overwrite an existing development setup:

   ```sh
   (
     set -e
     test ! -e yaaglwdos/wine
     test ! -e yaaglwdos/wineprefix
     test ! -e yaaglwdos/.storage/wine_state.neustorage
     test ! -e yaaglwdos/.storage/wine_tag.neustorage
     test ! -e yaaglwdos/.storage/game_install_dir.neustorage
     mkdir -p yaaglwdos/.storage
     /usr/bin/ditto "/Users/david/Library/Application Support/Yaagl OS/wine" yaaglwdos/wine
     /usr/bin/ditto "/Users/david/Library/Application Support/Yaagl OS/wineprefix" yaaglwdos/wineprefix
     /bin/cp "/Users/david/Library/Application Support/Yaagl OS/.storage/wine_state.neustorage" yaaglwdos/.storage/
     /bin/cp "/Users/david/Library/Application Support/Yaagl OS/.storage/wine_tag.neustorage" yaaglwdos/.storage/
     /bin/cp "/Users/david/Library/Application Support/Yaagl OS/.storage/game_install_dir.neustorage" yaaglwdos/.storage/
   )
   npm exec --yes --package=node@16.20.2 --package=pnpm@7.33.7 --call 'pnpm run start-hk4eos'
   ```

   This selects build channel `hk4eos`, server `hk4e_global`, development root `yaaglwdos`, and prefix `yaaglwdos/wineprefix`. It uses the local `4.11.0-yaagl-owned1` Neutralino build. The Wine selector prefers `yaaglwdos/wine/bin/wine64` if present, otherwise `yaaglwdos/wine/bin/wine`; confirm the exact absolute loader/prefix from the FPS request log. The copied distribution is not upgraded. Game files are prepared and restored by the existing launcher patch operations plus the new journal during authorized launches.

   China uses the exact command below, selecting `hk4ecn`, server `hk4e_cn`, root `yaaglwd` and prefix `yaaglwd/wineprefix`. It requires its own existing China game configuration containing `YuanShen.exe`; none was found in this checkout. Do not point China at the Global executable. Mark real China cases blocked until that game/profile is available. The UI-only fixture below can verify both channels without a game.

   ```sh
   npm exec --yes --package=node@16.20.2 --package=pnpm@7.33.7 --call 'pnpm run start'
   ```

   Record the exact launcher commit/parent, macOS/hardware, game region/version (also shown at the top of Settings → Game), Wine version/distribution and DXMT version, bridge manifest/build record, selected loader/prefix, game FPS/VSync/graphics/render-scale settings, display refresh rate, HDR/custom resolution/Metal HUD/ReShade settings, and logs:

   ```sh
   git log -1 --format='%H%n%P%n%s'
   /usr/bin/sw_vers
   /usr/sbin/system_profiler SPHardwareDataType SPDisplaysDataType
   /Users/david/code/home/yaagl_vibecoding/yet-another-anime-game-launcher/yaaglwdos/wine/bin/wine --version
   cat yaaglwdos/.storage/wine_tag.neustorage
   cat yaaglwdos/.storage/installed_dxmt_version.neustorage
   cat native/fps-bridge/build-record.json
   cat bin/hk4e-neutralino-arm64.json
   /usr/bin/shasum -a 256 sidecar/fps-bridge/fps-bridge.exe
   ```

   An absent `installed_dxmt_version` means acquisition has not completed; record it as absent, then record the resulting version after preparation. The source currently requests DXMT `0.80.0`. On Intel use the native record `bin/hk4e-neutralino-x86_64.json`. The current bridge is version 1, 28160 bytes, SHA-256 `28507fe29697ec4cde50c7bc9cb88a2a2d155cd9589c80bf65c81f248f090977`, built from the recorded local sources with signature attribution to upstream v3.0.7. The old 39,661,090-byte `unlockfps.exe` is not this artifact.

2. **Settings visibility, immediate persistence and no-write checks.** Click the gear labeled **Settings**, then **Game**. If needed select **English** under General → Launcher UI Language first. Visually inspect **Enable unlocking** (checkbox) and **Target FPS** (text input), click their labels, and edit both. There is no FPS Save button. Opening, closing and reopening without edits must leave the two FPS storage files byte-for-byte unchanged, including their absence and modification times.

   Before opening and again after dismissing without edits, run this read-only snapshot and compare its output. Use `yaaglwd` instead for China:

   ```sh
   python3 - <<'PY'
   from pathlib import Path
   import hashlib, json
   root = Path('yaaglwdos/.storage')
   for name in ('config_hk4e_fps_unlock_enabled', 'config_hk4e_fps_unlock_target'):
       p = root / (name + '.neustorage')
       if p.exists():
           data = p.read_bytes()
           print(json.dumps(dict(key=name, bytes=data.decode(), sha256=hashlib.sha256(data).hexdigest(), mtime_ns=p.stat().st_mtime_ns)))
       else:
           print(json.dumps(dict(key=name, absent=True)))
   PY
   ```

   Enter `061` with unlocking enabled: it stays as saved text and produces numeric target 61. Try `0`, `361`, `120.0` and empty text **without launching the game**; enabled invalid input must show validation and must not replace a previously valid saved pair. Disable while retaining invalid text: Step 3 permits storing that disabled draft; it must not block a disabled launch. Toggle back and correct it to `120`. Toggling must retain target text. Close/reopen settings, quit normally, restart with the same development command, and verify saved checkbox/target and storage snapshots. Opening after restart must not normalize the saved text.

   To repeat automated native rendering/persistence checks without any Wine/game execution:

   ```sh
   npm exec --yes --package=node@16.20.2 --package=pnpm@7.33.7 --call 'pnpm exec vite build --mode=development --config scripts/ui-fixture.config.ts'
   npm exec --yes --package=node@16.20.2 --package=pnpm@7.33.7 --call 'node scripts/test-settings-ui.cjs'
   ```

   Evidence goes to `.tmp/ui-verification/`, including `settings-game.png` per channel. The fixture imports the actual launcher, shared HK4E settings and Hope presentation controls, using real private Neutralino storage; channel/network/Wine operations are forbidden. It does not verify the full game/bootstrap path. Final native screenshots were visually inspected for both `hk4e_global-3mJdb4` and `hk4e_cn-g2zbSl`; persistence/no-write/restart checks passed on the final local native build.

3. **Disabled launch.** Disable unlocking and leave the target saved. In Settings → Game keep a normal supported baseline for HDR/resolution/Steam/network options and record those choices. Launch once. Confirm ordinary upstream behavior, upstream game DXMT maximum 60 (or its ordinary non-DXMT environment), zero FPS bridge acquisition/hash checks/helper requests, and no `fps-bridge.exe` associated with this request. Log inspection must distinguish ordinary DXMT/resource acquisition from FPS-specific acquisition. Exit the game normally. Confirm request-owned Wine waiting and config/patch cleanup complete before the primary action becomes available. Check settings remain usable.

4. **Separate enabled 60, 61 and 120 launches.** Use supported DXMT Wine metadata; disable **Enable Steam Patch** and **Launch Fix(block hosts)** for enabled tests. Save one target and launch it, then complete step 5 before the next target. Inspect `yaaglwdos/neutralinojs.log` (China: `yaaglwd/neutralinojs.log`) for the request token, exact staged artifact, explicit loader/prefix, target and both environment values:

   | Target | Game `d3d11.preferredMaxFrameRate` | Companion value | Worker argument |
   | ------ | ---------------------------------- | --------------- | --------------- |
   | 60     | 60                                 | 60              | 60              |
   | 61     | 0                                  | 61              | 61              |
   | 120    | 0                                  | 120             | 120             |

   The helper is now a thread in the bridge. Its argument is the generation-bound protocol `start` argument, not an unrelated `unlockfps.exe` process command line. Confirm `launched:1` with a stable original PID, worker generation 1 and `workerState:2` after discovery/initialization. The exact staged executable is `/tmp/yaagl-fps.<request nonce>/fps-bridge.exe`, identified in the log; its digest must match the manifest. Read its `response` file only; do not write protocol files in a real-game test.

   Use the available in-game/Metal HUD FPS measurement, record the measurement method and observed values under repeatable graphics settings. A target of 120 does not promise hardware can produce 120 frames/second. Optional 180/200 runs require headroom and the same cleanup checks; no 360 hardware run is required and lower-target success does not prove 360 performance.

5. **Normal exit, cleanup and relaunch.** Exit via the game's normal UI after each case. Verify original process exit and job `active:0`, worker `workerDone:1`, bridge release, confirmed supervisor/direct-child completion, the request-owned wineserver wait, registry restoration, the following registry-command Wine wait, and journal restoration. `config.bat` and other temporary files should be removed if newly created or restored if pre-existing. Check original HDR/resolution/Wine registry values and original patch files, including pre-existing `.bak` files, against the recorded snapshots. The private request directory is removed only after safe restoration.

   Main logs are `yaaglwdos/neutralinojs.log`; game output is `yaaglwdos/logs/game_<timestamp>.log`; DXMT logs/config are rooted in `yaaglwdos` by `DXMT_LOG_PATH`/`DXMT_CONFIG_FILE`. China substitutes `yaaglwd`. Failed/unconfirmed requests log retained `/tmp/yaagl-fps.<nonce>` and `/tmp/yaagl-owned-wine.<nonce>` paths; preserve their response/journal/registry evidence. Do not remove those directories during unresolved cleanup.

   Safe read-only inspection, in another terminal:

   ```sh
   /bin/ps -axo pid,ppid,lstart,command | rg 'fps-bridge\.exe|GenshinImpact\.exe|YuanShen\.exe|supervisor\.pl|wineserver'
   rg 'FPS request|FPS lifetime|retained|wineserver|config.bat' yaaglwdos/neutralinojs.log
   rg --files --hidden yaaglwdos | rg '\.(log|conf)$'
   ```

   A process snapshot is diagnostic, not ownership proof. Unrelated Wine processes are not leaks, and shared-prefix processes can delay `wineserver -w`. Relaunch only when the guard releases; confirm a fresh token/controller/generation and no stale helper or callbacks from the previous request.

6. **Duplicate actions.** Attempt a second primary launch during asynchronous preparation and during the game lifetime. Confirm the primary action is disabled/guarded, the status explains the current phase, and no second request, acquisition or game creation occurs. Repeat after the game exits while cleanup is pending. Use deterministic queue/transaction regressions for timing windows too short to reproduce reliably; label that evidence automated.

7. **Normal close/quit throughout the transaction.** Test the red window-close button, menu/Command-Q and Dock Quit during preparation, game lifetime, and cleanup. In particular test after game exit with worker/direct-child completion, Wine waiting and restoration individually pending. All must retain the transaction; normal close must not terminate the game. After safe cleanup, normal close must work without the AppKit crash from the earlier probe. If cleanup remains unconfirmed, the visible failure must retain admission and explain the retained resources; **Retry safe cleanup** retries prerequisites, not a forced release.

   Deterministic timing evidence:

   ```sh
   npm exec --yes --package=node@16.20.2 --package=pnpm@7.33.7 --call 'pnpm test src/launcher/launch-ownership.spec.ts src/clients/mhy/hk4e/fps-integration.spec.ts src/clients/mhy/hk4e/launch-fps-game.spec.ts src/clients/mhy/hk4e/program-launch-game.spec.ts src/wine/wait-until-server-off.spec.ts'
   npm exec --yes --package=node@16.20.2 --package=pnpm@7.33.7 --call 'node scripts/test-native-close.cjs'
   ```

   For the full production IO boundary using **only a compiled harmless fixture** and a disposable prefix, with macOS unlocked:

   ```sh
   npm exec --yes --package=node@16.20.2 --package=pnpm@7.33.7 --call 'pnpm exec vite build --mode=development --config scripts/runtime-fixture.config.ts'
   npm exec --yes --package=node@16.20.2 --package=pnpm@7.33.7 --call 'FPS_TEST_WINE="/Users/david/Library/Application Support/Yaagl OS/wine/bin/wine" node scripts/test-runtime-fixture.cjs --no-handoff'
   npm exec --yes --package=node@16.20.2 --package=pnpm@7.33.7 --call 'FPS_TEST_WINE="/Users/david/Library/Application Support/Yaagl OS/wine/bin/wine" node scripts/test-runtime-fixture.cjs'
   ```

   These check actual acquisition/staging/hash IO, Perl supervision, bridge/controller, registry snapshots and a dummy file journal. The `--no-handoff` case must finish successfully. The intentional root-to-descendant handoff must remain guarded, stop FPS retargeting, and end with the expected unsupported-handoff diagnostic after safe cleanup. Neither is a real-game FPS test.

   Both UI-driven runtime cases passed after the Mac was unlocked. Earlier attempts were blocked because WebKit suspended timers while locked. The real native/Wine boundary was also tested with `--rpc`: the same built transaction and unmodified Neutralino client run in a Node VM against the actual local native server. Only the fixture's text display is replaced. This is native/Wine evidence, **not visual evidence**, and does not bypass the screen lock. To repeat those checks:

   ```sh
   npm exec --yes --package=node@16.20.2 --package=pnpm@7.33.7 --call 'FPS_TEST_WINE="/Users/david/Library/Application Support/Yaagl OS/wine/bin/wine" node scripts/test-runtime-fixture.cjs --rpc --no-handoff'
   npm exec --yes --package=node@16.20.2 --package=pnpm@7.33.7 --call 'FPS_TEST_WINE="/Users/david/Library/Application Support/Yaagl OS/wine/bin/wine" node scripts/test-runtime-fixture.cjs --rpc'
   ```

8. **Failure boundaries and stop rule.** Stop real-game testing if attribution, ownership, termination or restoration is uncertain. Preserve all logs and retained request paths and record **failed** or **blocked**, not success. Do not use `killall`, process-name `taskkill`, prefix resets or shared wineserver termination to manufacture/recover a failure. Abnormal-exit tests may target only a verified owned harmless fixture. Targets 1/360 remain synthetic automated boundary coverage and a later controlled matrix; they are not initial smoke requirements. Fix blocking Step 7.5 defects separately and retest. **Packaged-app testing is a later gate after Step 8; neither automated Step 7 checks nor development-mode smoke testing establishes packaged-app or release readiness. Stop here.**
