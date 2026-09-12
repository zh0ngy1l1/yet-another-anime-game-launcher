# Step 7 implementation and evidence

The enabled HK4E development route uses a source-built, target-bound FPS bridge. The [Steam Patch fix below](#2026-09-12-steam-patch-fix) adds an owned route through the original signed shim; keep **Enable Steam Patch on** and **Launch Fix(block hosts) off**. The earlier implementation and preflight evidence is retained with its tested revisions. Real game execution and measured FPS remain **not run** by the agent; the operator alone performs those tests. Follow the [numbered Step 7.5 checklist](step-7.5.md), starting with the disabled baseline on the final fix, then enabled 60 and review before 61/120. Packaged-app testing remains after Step 8.

## Original Step 7 checkout and scope

- Checkout: `/Users/david/code/home/yaagl_vibecoding/yet-another-anime-game-launcher`.
- Starting HEAD: `3cf3e066b25e843809298db1601be92d58bc5ef6`; sole parent `482f216511b23cede620bfdffd5e4c654bc674dc`.
- Starting and unchanged `origin/main`: `514ebed106dc8c3b986a655d39d5bded8753941b`.
- Started on clean `main`, seven ahead/zero behind. The reported completed modules and prior commits were available and inspected. No applicable `AGENTS.md` was found. No canonical fetch, pull, reset, rebase, amend, cherry-pick or push was performed.
- Read-only legacy checkout: `/Users/david/code/home/legacy/yaagl-fpsunlock-gamemode-legacy`, HEAD `d48bd81bfcd64b337c92d2b53d0dacc3321a9b41`. The requested reference commits were locally available; the existing eleven modified legacy files were left untouched.
- Lockfile, dependency versions, `sophon_server/uv.lock`, `configure.sh`, `build-sophon.sh`, `neutralino.config.json`, `src/wine/distro.ts` and `build-app.js` remain unchanged against the starting HEAD. Package scripts only wire the local HK4E development resources/runtime. No installed launcher or Wine distribution was replaced.
- The prerequisite commit is `1c45c5886d0596063f20c54b9bcb2878f3f766cc` (`feat(hk4e): add target-bound FPS launch bridge`), parent `3cf3e066b25e843809298db1601be92d58bc5ef6`. The final integration commit is `feat(hk4e): launch FPS unlocker with owned cleanup`. Their exact IDs/parents are reported by the final handoff and `git log -2 --format='%H %P %s'`. All prior commits remain ancestors. No binaries, test profiles, crash reports or private protocol files are committed.

## Original implementation mechanism and limits (before the Steam fix)

The [source/build boundary](../native/fps-bridge/README.md) links the inspected Win32, Wine and upstream helper sources. `fps-admission.ts` snapshots validated persisted settings, the supported direct executable and selected Wine context before acquisition/mutation. A request token is only a protocol identity. `bridge.c` establishes process identity with `CreateProcessW` suspended, keeps its returned process handle, assigns an unnamed job with breakaway disabled, then resumes it. The FPS worker is a thread using that same retained handle. There is no process-name/foreground discovery, PID reopening, target fallback or adoption of a later incarnation.

Root exit stops FPS work. Win32 descendants, including the tested detached fixture child, keep the job nonempty and cleanup guarded. The bridge reports unsupported handoff and never retargets a child. Handoff through a pre-existing service, native Unix fork or another prefix is not covered. Current Genshin direct-entry behavior remains a live-game gate. An in-app lease does not coordinate external launchers using the same game files or Wine installation.

The Perl supervisor still owns/reaps only its direct Wine child. Bridge/job/thread completion, foreground-command completion, companion stop, request-owned Wine waiting, registry restoration and file restoration are distinct. Unknown lifetime or a timeout retains observation/admission and visible diagnostics. Cleanup errors retain originals and offer safe retry; they never authorize killing a running game, guessing ownership or releasing the guard. Force quit, launcher crashes, power loss and destruction of the private mailbox are not recovered guarantees.

Three local same-revision Neutralino patches are necessary and supported by actual probes: normal Cocoa Quit reaches the JS veto; approved exit runs on the AppKit main thread; foreground `os.execCommand` runs off the single RPC dispatch thread while retaining the original response ID. Without the last patch, a foreground request blocks its own mailbox RPCs. The supplied second crash report identified the AppKit violation in an earlier close probe. Both supplied reports remain untouched; later close fixtures exited normally.

At integration commit `0f5b4bf7b0d11daa747c78842d7bf1bec2b3796f` and bootstrap commit `888ea8975dcabd8509d6cf90e3dc5269b17b21fc`, the bridge was protocol/artifact version 1, **28160 bytes**, SHA-256 **`28507fe29697ec4cde50c7bc9cb88a2a2d155cd9589c80bf65c81f248f090977`**. The build record at those commits records GCC 16.2.0, source hashes, flags and signature-source revision `56b9c64381ef9fd59e916dc9bf547d3210ab5db1` from `rishabhroyy/genshin-fps-unlock-universal`. MIT attribution is retained. A repeated local build matched; this is not cross-host reproducibility. The old v3.0.7 binary identity/provenance warning remains unchanged and that target-agnostic artifact is not selected by Step 7. The current version 2 identity is recorded below.

Execution uses a verified private mode-700 staging directory and its exact mode-400 artifact, checked before initial execution, registry utility execution and worker restarts. Same-user/administrator replacement between verification and loading remains possible. The implementation does not claim protection against that privilege level.

Before the Steam fix, enabled support was limited to direct Global/China HK4E with the admitted Wine 11 DXMT distributions and local native runtime `4.11.0-yaagl-owned1`; enabled Steam and background privileged network blocking were rejected before side effects. The Steam rejection is superseded by the supported route below. Disabled launches retain upstream route/environment/FPS settings semantics, without FPS acquisition, verification or helper execution. Step 5 supplies all target/environment policy; controller defaults remain 90-second discovery, 10-second initialization and 5-second restart backoff, with no session timeout.

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

At the original handoff, real Global/China game cases were **not run**, pending provenance acceptance and explicit authorization. China requires an existing China game/profile; it was not present here. Initial smoke targets are 60, 61 and 120; optional 180/200 depend on hardware. The synthetic 360 test only writes an integer in a harmless process, consumes no real game rendering workload and does not prove achievable 360 FPS. Packaged-app behavior remains a separate gate after Step 8. Use the complete [Step 7.5 checklist](step-7.5.md).

## 2026-09-12 bootstrap closeout and manual preflight

This checkpoint was a read-only source/profile/process review, followed only by documentation updates. No Wine command, registry utility, bridge or game was executed; no setting, game file, prefix, runtime or production code was changed. No commit or push was made.

**Checkout attribution:** HEAD is `888ea8975dcabd8509d6cf90e3dc5269b17b21fc`, parent `0f5b4bf7b0d11daa747c78842d7bf1bec2b3796f`; initially clean `main`, ten ahead/zero behind unchanged `origin/main` `514ebed106dc8c3b986a655d39d5bded8753941b`. The profile's `dist/index.html` loads `assets/index.17c07131.js`, SHA-256 `933f5e7b7dbe658bdac83ec65f785397ae8c1c1aaf0ca41b325b7c0dbba671e1`, identical to the retained development build for the bootstrap fix. This supports attributing the operator's retest to that commit; the environment record made at 04:04 still correctly records the earlier `0f5b4bf` and was not overwritten.

**Operator-reported passes, not independently repeated:** the old launcher quit normally; Global development startup became visible and loaded; Settings → Game showed **Enable unlocking** and **Target FPS**; editing, validation, retained text, immediate persistence and reopening worked; opening/dismissing without edits passed the storage no-write checks; normal quit/restart worked and saved choices persisted. The operator explicitly reported no real-game execution during this retest. The bootstrap/settings checkpoint is closed on that evidence, supported by the independent checks below. No additional code change is required to record it.

**Independent log checks:** sessions beginning at 04:49:24, 04:51:10 and 04:51:58 each start aria2 1.37.0, retry Sophon at approximately three-second intervals and then obtain successful Global game metadata (`version:7.0.0`, `release_type:os`, `error:null`). This is consistent with the window/timer fix. The initial health transport failures recover; no later bootstrap fatal error is recorded. Shutdown entries occur at 04:50:50, 04:51:52 and 04:52:26 without a logged cleanup failure. Process and targeted open-file snapshots found no running launcher, game, Wine, wineserver, aria2 or Sophon, or open game executable/copied loader/user registry at review time. These are point-in-time observations, not an inter-launcher lock or proof of a future transaction's cleanup. Log SHA-256 at review: `0f7f1064b89f4f61aad2b9bd73d558d8c29234178e10a120582c26a55e9f8522`.

**Recorded acceptance:** `.tmp/step7.5/authorization.txt`, dated `2026-09-12T04:02:00-0400`, explicitly accepts third-party provenance limitations and authorizes development-mode Global real-game FPS testing, excluding working-runtime replacement and China testing. It was independently read; SHA-256 `c75f8306af6cf90a7d6869824da7322b2cd520b0dc7ea400b141a015067d2f13`. Acceptance is already present; do not ask for it again. The operator's current instruction reserves Launch/game operation to the operator and does not authorize agent execution.

| Context                     | Independently verified state                                                                                                                                                                                                                                 |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Channel/profile             | `start-hk4eos` builds `hk4eos`, server `hk4e_global`, root `/Users/david/code/home/yaagl_vibecoding/yet-another-anime-game-launcher/yaaglwdos`                                                                                                               |
| Selected loader             | `/Users/david/code/home/yaagl_vibecoding/yet-another-anime-game-launcher/yaaglwdos/wine/bin/wine`; executable regular file; `wine64` is absent, so the source's fallback selects this file                                                                   |
| Prefix                      | `/Users/david/code/home/yaagl_vibecoding/yet-another-anime-game-launcher/yaaglwdos/wineprefix`; existing directory, not a symlink                                                                                                                            |
| Wine admission metadata     | `wine_state=ready`, `wine_tag=11.0-dxmt-signed-with-patches`; built-in attributes `renderBackend=dxmt`, `winePath=wine` satisfy the enabled distribution/backend checks. Static ntdll strings also contain `wine-11.0`; no Wine executable was invoked       |
| Native runtime              | `scripts/run-hk4e.cjs` selects local `bin/hk4e-neutralino-arm64`; version record `4.11.0-yaagl-owned1`, actual SHA-256 `3e04ed4a6d2b5389d7dbe525367881a08a5081314ef6dddf973227a66a3857e1` matches                                                            |
| Actual game                 | `/Users/david/.gimpact/GenshinImpact.exe`, existing regular file. `globalgamemanagers`, parsed at HK4E's source offset `0xac`, reports `7.0.0_47144228_47194594`. Game files were **not copied** with the development prefix                                 |
| Persisted FPS/route options | Unlocking `false`, retained target `120`, Steam Patch `true`; `config_block_net` absent means Launch Fix(block hosts) `false`. `config_timeout_fix=true` is the separate **Timeout Fix**, not network blocking                                               |
| Other relevant options      | Metal HUD `true`; HDR, custom resolution, ReShade, Retina and Left Command remapping default off from absent keys                                                                                                                                            |
| DXMT resource preparation   | `yaaglwdos/dxmt`, `installed_dxmt_version` and `dxmt.conf` are absent. The first launch requests the existing DXMT v0.80 resource (`0.80.0` storage version). This ordinary resource download is separate from FPS acquisition; its failure must be reported |

The copied Wine libraries and prefix files that launch preparation can change are regular files at development-profile paths and do not share file inodes with their working-profile counterparts. This avoids writing through symlinks/hardlinks to the working Wine installation. It does **not** isolate `/Users/david/.gimpact` from another launcher using that game directory.

At this preflight, the selected FPS resource was `yaaglwdos/sidecar/fps-bridge/fps-bridge.exe`: **28,160 bytes**, SHA-256 **`28507fe29697ec4cde50c7bc9cb88a2a2d155cd9589c80bf65c81f248f090977`**. Both staged and root sidecar copies matched the then-current manifest/build record; `bridge.c` and `registry.c` hashes also matched that record. Enabled Step 7 used this program and its internal worker thread, with no fallback to downloaded `unlockfps.exe`. No execution-stage artifact or real-game launch identity existed at this checkpoint. The new version 2 identity is recorded in the fix below.

### Required Steam compatibility: preflight blocker at 888ea897 (superseded below)

The operator reports that Genshin crashes before world load without **Enable Steam Patch**, and requires Steam Patch support. Keep it **on**, including for the disabled baseline. The earlier instruction to turn it off is withdrawn for this profile. Keep **Launch Fix(block hosts)** off; it is already off. Timeout Fix can retain its current value.

At preflight HEAD `888ea897`, `fps-admission.ts` explicitly rejected enabled `config.steamPatch` before FPS acquisition/mutation. The disabled route calls `wine.exec2` in request-bound foreground mode with `C:\windows\system32\steam.exe` and the game path. By contrast, the then-current `bridge.c` directly created the game with `CreateProcessW` and retained that returned handle. Merely deleting the admission check, substituting the Steam PID as the game, or watching an executable name would not implement the required target binding.

The existing signed Steam shim's source is not included beside the binary. The root sidecar, development sidecar and copied prefix `system32/steam.exe` all hash to `0424339444c54bf1f9fdbadf12e4e2c90ceef41d987fe573b93f5f2ebfd8a657`. Local history identifies the signed replacement at `347fbd2cc89f30a5780a42d6889076b731edefed`. Binary imports/strings include `CreateProcessW`, `ShellExecuteW` and `steamclient_init_registry`; these do not establish its complete creation/registry semantics.

**Smallest proposed prerequisite:** pin/review the shim's corresponding source and retain its compatibility initialization and game-parent relationship, adding a private handoff of the actual `CreateProcessW` game handle to the existing bridge before the game resumes. Assign/retain the job and target incarnation, account separately for shim completion, and journal any required Steam setup mutations. Validate this route with harmless Steam-launch fixtures, decoys, early shim exit, worker shutdown and restoration tests before the operator's enabled-60 test. A changed artifact requires a new manifest/build record. This is a proposed fix, not an implementation or live compatibility guarantee. Production code was not changed in this preflight.

### Restoration and evidence boundaries

- Both routes use `launch-journal.ts`: each captured destination and pre-existing `.bak` is copied with `cp -pP` before mutation into `file-N`, with original path/kind in `journal.json`. Newly created files/directories are recorded as absent. Successful restore updates `restored`, then removes backups and the journal. Failures retain them for safe retry. Enabled journals are under the request's `/tmp/yaagl-fps.<nonce>`; disabled journals use `/tmp/yaagl-launch.<nonce>`.
- With current Global settings, launcher changes to the shared game directory are temporary renames of `GenshinImpact_Data/upload_crash.exe`, `GenshinImpact_Data/Plugins/crashreport.exe` and `GenshinImpact_Data/Plugins/vulkan-1.dll` to `.bak`. All originals are present and all three `.bak` files are absent at preflight. The Global patched/added lists are empty. ReShade is off; enabling it would add more game-directory writes. The game itself may write its ordinary data/logs/settings.
- Profile-local mutations include `config.bat`, `winedrv_config.bat`; Wine's `d3d10core.dll`, `d3d11.dll`, `dxgi.dll` and their `.bak` destinations; `winemetal.dll/.so`; prefix `system32/winemetal.dll`, `steam.exe` and `lsteamclient.dll` in both Windows system directories, and the protection-file destination `system32/HoYoKProtect.sys`. The protection copy is executed by the direct route's config script; the disabled Steam branch does not execute that config script. Journals cover these launcher-controlled destinations. DXMT resource cache/version and ordinary logs persist.
- Enabled registry save runs the verified bridge's short-lived `--registry save` mode **before** setup. `registry-0/1` capture RetinaMode/LeftCommandIsCtrl, `registry-2` HDR when requested, and `registry-3/4/5` fullscreen/width/height when requested, preserving key/value existence, type and raw bytes. Restore runs only after game/job/worker/direct-child completion and a Wine wait, followed by another owned registry completion/Wine wait before file restoration. The registry format is defined in `native/fps-bridge/registry.c`.
- The disabled baseline has **no FPS registry snapshot**. Its upstream Wine preference writes persist; optional HDR/resolution cleanup deletes the specified values rather than restoring arbitrary prior values. Keep HDR/custom resolution off for this baseline. Read-only inspection of the inactive prefix's `user.reg` found RetinaMode=`n`, LeftCommandIsCtrl=`n`, HDR absent, fullscreen=`1`, width=`1512`, height=`982`; current launcher preferences write the same two Wine values. Game/Steam registry writes are not an exact whole-prefix rollback guarantee. Do not execute Wine registry queries during preflight.
- Disabled has no bridge token, retained game HANDLE/job observer, worker or Perl supervisor. Its evidence is the request-bound Steam command, separate Wine waits, journal restoration and guard release. Do not attribute the enabled bridge's stronger lifetime evidence to the disabled baseline.
- Existing `/tmp/yaagl-fps.4fbVUzV25W`, `.DRt2QCwwU7` and `.qUdygHxuhL` journals reference earlier **disposable fixture** `original-file` paths, not this game/profile. Three old `/tmp/yaagl-owned-wine.*` mailbox directories also remain. They were not deleted, and their mere presence must not be attributed to a new real-game run. Identify fresh request paths from that run's log and time boundary.

Protocol evidence at preflight, before the additional Steam fields below: `FPS request <token>: artifact=...; loader=...; prefix=...; target=...` gives the request context. JSON transitions show `launched:1`, stable original `pid`, generation, and `workerState:2`/`workerDone:0` for application; require zero error fields. Normal end requires `primaryExited:1`, `active:0`, `workerDone:1`, then `released:1` and a separate foreground completion with `confirmed:true`, status 0 and no error/cleanupError. Unknown `active:4294967295`, a vanished window, PID snapshot or foreground return alone is not exit proof. The worker's requested target comes from the request header and generation-bound `start` command; the response does not echo the target.

At preflight, successful registry executions and Wine waits had no standalone structured success log; the fix below adds completion messages. Their awaited ordering is enforced in source; command lines alone record issuance. Use the full ordered log, final absence of errors/held operation, and before/after file/value evidence together. The UI's normal-close/primary-action guard must remain held through all cleanup. Persistent failure details and retained paths can be visible in the UI without being repeated verbatim in `neutralinojs.log`; capture those messages as well. Do not claim a complete independent cleanup audit from a grep result alone.

### Next operator checkpoint: disabled baseline only

Start using the existing `pnpm run start-hk4eos` command with Node 16.20.2/pnpm 7.33.7; do not repeat configure, profile copying or runtime installation. Confirm **Enable unlocking off**, **Enable Steam Patch on**, **Launch Fix(block hosts) off**, HDR/custom resolution off; retain target 120 and record Timeout Fix/Metal HUD and game graphics settings. Record the run's timestamp, commit and before-state evidence, then the operator may press **Launch**. Do not accept an Install Wine, launcher update or game Update prompt for this smoke test.

Expected baseline: ordinary Steam shim launch; game DXMT `d3d11.preferredMaxFrameRate=60;`; no new FPS request, bridge staging/verification or worker. Ordinary DXMT resource download is expected once. Reach world load, record measurement method/observed FPS, VSync, render scale/resolution and graphics settings, then exit through the game's normal UI. Allow the request-owned Wine wait and file restoration to finish before testing normal launcher quit or proceeding. An unavailable close/new-launch action during game or cleanup is expected.

Run this read-only snapshot **before Launch and after safe cleanup**, retaining both outputs for comparison. It covers the current launcher-controlled file destinations; resource cache/log growth and ordinary game registry writes are separate observations. It does not invoke Wine or write a snapshot file itself.

```sh
python3 - <<'PY'
from pathlib import Path
import hashlib, json, os, stat
profile = Path('yaaglwdos').resolve()
game = Path((profile / '.storage/game_install_dir.neustorage').read_text())
paths = []
for name in ('GenshinImpact_Data/upload_crash.exe',
             'GenshinImpact_Data/Plugins/crashreport.exe',
             'GenshinImpact_Data/Plugins/vulkan-1.dll'):
    paths.extend(game / (name + suffix) for suffix in ('', '.bak'))
for name in ('d3d10core.dll', 'd3d11.dll', 'dxgi.dll'):
    paths.extend(profile / 'wine/lib/wine/x86_64-windows' / (name + suffix)
                 for suffix in ('', '.bak'))
paths.extend(profile / name for name in (
    'config.bat', 'winedrv_config.bat', '.storage/patched.neustorage',
    'wine/lib/wine/x86_64-windows/winemetal.dll',
    'wine/lib/wine/x86_64-unix/winemetal.so',
    'wineprefix/drive_c/windows/system32/winemetal.dll',
    'wineprefix/drive_c/windows/system32/HoYoKProtect.sys'))
for directory in ('system32', 'syswow64'):
    paths.extend(profile / 'wineprefix/drive_c/windows' / directory / name
                 for name in ('steam.exe', 'lsteamclient.dll'))
for p in paths:
    row = {'path': str(p)}
    if not os.path.lexists(p):
        row['kind'] = 'absent'
    elif p.is_symlink():
        row.update(kind='symlink', target=os.readlink(p))
    elif p.is_file():
        row.update(kind='file', mode=oct(stat.S_IMODE(p.stat().st_mode)),
                   sha256=hashlib.sha256(p.read_bytes()).hexdigest())
    else:
        row['kind'] = 'directory'
    print(json.dumps(row))
PY
```

From the repository root, these inspection commands read only:

```sh
git log -1 --format='%H%n%P%n%s'
cat yaaglwdos/.storage/wine_tag.neustorage
tail -n 120 yaaglwdos/neutralinojs.log
rg -n 'FPS request|FPS lifetime|retained|yaagl-launch\.|wineserver|config.bat|non-zero|Restore ' yaaglwdos/neutralinojs.log
ls -lt yaaglwdos/logs
rg --files --hidden yaaglwdos | rg '\.(log|conf)$'
/bin/ps -axo pid,ppid,lstart,command | rg 'fps-bridge\.exe|GenshinImpact\.exe|steam\.exe|supervisor\.pl|wineserver'
python3 - <<'PY'
from pathlib import Path
for pattern in ('yaagl-launch.*/journal.json', 'yaagl-fps.*/journal.json'):
    for p in sorted(Path('/tmp').glob(pattern)):
        print(p, p.read_text())
PY
```

During an enabled run, the exact staged artifact and `response`/`registry-N` files are in the **specific directory from its request header**; inspect that directory read-only while it still exists. Successful cleanup intentionally removes it. `/tmp/yaagl-owned-wine.<nonce>` retains `supervisor.pl`, `ready` and possibly `stop` on uncertainty; it is a cooperative mailbox, not an ownership handle. Do not write commands, remove directories, run a second wineserver wait manually, or kill processes to force progress.

For the disabled checkpoint, provide the full `yaaglwdos/neutralinojs.log`, newly created `yaaglwdos/logs/game_<timestamp>.log`, terminal output, any new profile DXMT logs, before/after journal or file-comparison evidence, settings/graphics choices, world-load/FPS observations, normal-exit time and whether the primary action/settings/normal quit became available after cleanup. Report any visible error verbatim and preserve the fresh journal/mailbox paths. Stop on a crash, failed setup/restore, unknown lifetime, unconfirmed completion or retained cleanup failure; do not force quit or terminate wineserver. FPS below a requested cap alone does not establish an unlocker defect.

**Statuses at the preflight checkpoint, before the fix below:** bootstrap/settings **passed (operator-reported, independently corroborated by logs/build/profile)**; disabled real-game baseline **not run**; enabled 60/61/120 **blocked by required Steam Patch support and not run**; measured real-game FPS **not run**. The next section records implementation and fixture verification of that prerequisite; these historical statuses do not describe new real-game results.

## 2026-09-12 Steam Patch fix

The current fix is `fix(hk4e): support Steam Patch in owned FPS launches`, with parent `888ea8975dcabd8509d6cf90e3dc5269b17b21fc`. Its exact commit is available from `git log -1 --format='%H%n%P%n%s'` and the implementation handoff. The starting branch was `main`, ten ahead/zero behind unchanged `origin/main` `514ebed106dc8c3b986a655d39d5bded8753941b`. No prior commit was rewritten or pushed. The two existing uncommitted preflight documentation edits were incorporated, with their bootstrap/settings passes, acceptance and historical blockers retained above. The earlier screenshots, crash reports and legacy checkout changes were preserved.

### Supported Steam route and remaining limits

The [source investigation](../native/fps-bridge/steam-source.md) records the inspected Valve reference revision, actual symbol-bearing binary disassembly, signature inspection, Wine process/handle/job implementations and fixture evidence. Exact signed-shim source-to-binary correspondence is **not established**. The shim and accompanying DLL retain their original signed bytes; no signature was removed or substituted. Valve attribution is included in `LICENSE.steam`.

The source and actual binary distinguish ordinary `.exe` launching from the broader Proton service mode selected by **presence** of `SteamGameId`. The latter can initialize Steam registry/library/VR/restart state; it is rejected before acquisition/setup, with another native check before starting the shim. No variable is silently stripped. The ordinary launcher Steam Patch route runs the original shim unchanged and has no extra Steam registry/library initialization. Actual fixtures compare both registry views and relevant library files before/after.

The bridge starts that shim suspended, retains its process HANDLE and assigns a Steam job before resume. The shim starts a harmless request-specific relay in the same bridge image. An exclusive mapping/event rendezvous validates token, version, expected Windows parent and single-use state. It conveys readiness, **not a numeric handle or PID that the bridge reopens**. The bridge then creates the actual game suspended with the retained shim HANDLE as `PROC_THREAD_ATTRIBUTE_PARENT_PROCESS`, holds the returned game HANDLE, verifies Windows parent/inherited Steam job and assigns a nested game job before resume. Real Wine fixtures verify the required parent relationship, environment, unchanged Steam argument/cwd behavior and actual stdout handle inheritance. The worker only uses the retained game HANDLE; it cannot target the shim, decoy or a later process incarnation.

Game exit stops the worker and releases the relay immediately, allowing the original shim's child wait to finish without waiting circularly for job/bridge release. Separate protocol fields cover game, shim, Steam job and worker. Descendants remain accounted for and are not adopted as FPS targets. Early/nonzero shim exit is an explicit failure while game observation continues. Missing/malformed/late rendezvous cannot authorize fallback. Unknown lifetimes and cleanup failures keep admission/normal close guarded with diagnostics and safe retry. Release still requires all relevant process/job/thread completion, followed by the supervisor's **direct Wine child** completion, owned Wine waits, exact registry restoration and file-journal cleanup.

The existing patch preparation still copies the prefix Steam/DLL files and journals original contents before mutation, including pre-existing backups and partial failures. Like disabled Steam, enabled Steam writes but does not execute `config.bat`; it does not run the direct route's protection-file copy. The persisted Steam setting is untouched. Direct enabled launch, disabled Steam/non-Steam launch, target validation and the Step 5 DXMT policy are preserved. The bridge/Steam artifacts are verified in private staging, before boot/game creation, and the bridge again before worker starts/restarts. Win32 read handles deny cooperating image replacement until release; same-user/administrator POSIX replacement remains a documented limitation.

Windows parentage is tested; Unix parentage may differ. The shim now has a relay child command line and its signed image is staged privately. **Neither source inspection nor fixture passes prove Genshin world-load compatibility, game handoff behavior or measured FPS.** A handoff through a pre-existing service/native Unix process/another prefix is unsupported. Other launchers can still conflict with shared files; there is no inter-launcher lock or force-quit/crash/power-loss recovery promise.

### Current build and artifacts

| Selected component                                                 |   Bytes | SHA-256                                                            |
| ------------------------------------------------------------------ | ------: | ------------------------------------------------------------------ |
| Source-built bridge/relay/worker, protocol 2                       |   34304 | `3dac6250497a7265e0a62126125d3e850e67e7b7dabb9f0d34264fb5c08ddd8f` |
| Original signed `steam64.exe`, staged as `steam.exe`               |  111304 | `0424339444c54bf1f9fdbadf12e4e2c90ceef41d987fe573b93f5f2ebfd8a657` |
| Original signed `lsteamclient64.dll`, staged as `lsteamclient.dll` | 5560872 | `af50ed0d952ef98d99d4d3ff67b4836b545c9403894430fca31969f9f630637b` |

The [build record](../native/fps-bridge/build-record.json) records GCC 16.2.0, strict flags, source hashes and upstream pattern revision `56b9c64381ef9fd59e916dc9bf547d3210ab5db1`; the inspected Steam reference is `8c0fbeb0503d2fc9ba7736b37e383279e45062bc`, signed resource commit `347fbd2cc89f30a5780a42d6889076b731edefed`. The checked build and repeated local compilation match the new bridge hash. No new dependency, lockfile update, Wine/native-runtime change, source publication or binary upload was needed. The legacy target-agnostic downloaded `unlockfps.exe` remains unused. Prior provenance acceptance remains recorded, without expanding the agent's game-execution authority.

After checking that no launcher/game/Wine transaction was active, the new bridge/licenses and Global UI build were staged into `yaaglwdos/sidecar/fps-bridge` and `yaaglwdos/dist` using the existing development copy semantics, without starting the launcher. The selected staged bridge matches the table. The staged UI is `assets/index.ab8e0e0d.js`, SHA-256 `7b49cc416bfe07198e737b2f0bab1dfd16e39cd160779978646dd77ac713b1a2`, identical to the new build. The profile's signed Steam pair also matches. Evidence: `.tmp/steam-source-inspection/staged-resources.json` and `profile-before-stage.json` / `profile-after-stage.json`; all 28 settings, registry, loader, log and shared game-file snapshots are unchanged across staging. Steam Patch remains true, unlocking false, saved target 120, block-hosts setting absent/false. The prior neutralino log and authorization hashes still match the preflight. This resource inspection is not visual or real-game evidence.

### Verification of this fix

All Node/pnpm commands below ran through the pinned Node **16.20.2** / pnpm **7.33.7** wrapper in the canonical checkout. Logs are under `.tmp/steam-source-inspection/`; temporary fixture paths are printed in each log. Every Wine fixture uses a fresh disposable prefix and built harmless processes, never the copied user prefix or shared game directory.

| Check                                                                                                                                              | Result and evidence                                                                                                                                                                                                                                                                   |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `./configure.sh`                                                                                                                                   | Passed, `configure-final.log`                                                                                                                                                                                                                                                         |
| `node scripts/prepare-hk4e-dev.cjs`                                                                                                                | Passed strict bridge build/pins and existing local native selection, `wine-steam-final.log`                                                                                                                                                                                           |
| `pnpm exec tsc`, `pnpm run lint`, `pnpm run format-check`, `pnpm test`                                                                             | Passed: **1924 tests / 18 files**, type/format passed, **nine existing lint warnings / zero errors**, `checks-final.log`; baseline before this fix was 1894 tests and nine warnings. Counts report automated coverage, not production guarantees                                      |
| Five focused FPS/admission/launch/journal test files                                                                                               | **104 tests / five files**, `focused-final.log`; includes actual route-specific preparation, controller/bridge adapter, global close/admission and independent restoration failures                                                                                                   |
| `node scripts/test-owned-execution.cjs`                                                                                                            | Passed real OS direct-child natural/cancelled completion and untouched decoy, `native-final.log`                                                                                                                                                                                      |
| `node scripts/test-native-close.cjs`                                                                                                               | Passed actual concurrent request RPCs, private mailbox access, normal-quit veto and approved exit, `native-final.log`                                                                                                                                                                 |
| `/usr/bin/perl -c src/wine/owned-execution.pl`                                                                                                     | Passed, `perl-syntax-final.log`                                                                                                                                                                                                                                                       |
| `/usr/bin/perl src/wine/owned-execution.t`                                                                                                         | Passed eight simulated cases/24 assertions, `perl-tests-final.log`; distinct from the real OS fixtures                                                                                                                                                                                |
| `FPS_TEST_WINE="/Users/david/Library/Application Support/Yaagl OS/wine/bin/wine" node scripts/test-fps-bridge.cjs --steam`                         | Passed actual signed shim/relay/parent HANDLE path, targets 1/60/61/120/360, decoys/no retargeting, descendants, wrong/stale protocol, worker restart/stop, eight rendezvous/shim fault cases, unchanged Steam registry/library files and registry round-trip, `wine-steam-final.log` |
| Same fixture without `--steam`                                                                                                                     | Passed original direct boundary and registry tests on the new artifact, `wine-direct-final.log`                                                                                                                                                                                       |
| `pnpm exec vite build --config scripts/runtime-fixture.config.ts --mode development`                                                               | Passed, `build-ui-final.log`                                                                                                                                                                                                                                                          |
| `YAAGL_CHANNEL_CLIENT=hk4eos pnpm exec vite build --mode development --outDir .tmp/steam-hk4eos-build`                                             | Passed Global UI build; existing neutralino-script and chunk-size notices, `build-ui-final.log`                                                                                                                                                                                       |
| `FPS_TEST_WINE="/Users/david/Library/Application Support/Yaagl OS/wine/bin/wine" node scripts/test-runtime-fixture.cjs --rpc --steam --no-handoff` | Passed final production IO/staging/verification/controller/Native/Wine/close/restoration boundary, `runtime-steam-source-final.log`                                                                                                                                                   |
| Same runtime fixture with `--rpc --steam`                                                                                                          | Passed intentional root-to-descendant failure: guard retained, no retargeting, eventual safe cleanup, `runtime-steam-descendant.log`                                                                                                                                                  |
| Same runtime fixture with `--rpc --steam --tamper-steam --no-handoff`                                                                              | Passed actual private shim replacement after acquisition: rejected before game/relay/worker creation, registry/file cleanup complete, `runtime-steam-tamper-final.log`                                                                                                                |
| Same runtime fixture with `--rpc --no-handoff`                                                                                                     | Final direct regression, `runtime-direct-source-final.log`                                                                                                                                                                                                                            |
| `node scripts/test-bootstrap.cjs`                                                                                                                  | Passed visible delayed health (two requests) and visible unavailable-service failure (ten requests), `bootstrap-final.log`; no bootstrap code/health/native-close checks weakened                                                                                                     |

Deterministic tests also keep duplicate admission and normal close blocked after actual game exit while relay/job, worker, supervisor, Wine wait, registry and file cleanup are individually pending. Cancellation during rendezvous accounts for late game creation, and unconfirmed completion is visibly failed until eventual safe cleanup. Real fault fixtures include failure before shim child creation, missing/mismatched/version-invalid/late readiness, early shim exit while the game remains alive and nonzero shim completion. Numeric PID reuse is not forced by the OS fixtures: retained handles provide incarnation safety and deterministic tests reject changed identities. Real filesystem tests cover every partial Steam destination copy, preserving pre-existing originals/backups and retry after independent cleanup failure.

The bootstrap/settings passes in the preflight remain **operator-reported at 888ea897**, corroborated by its build/profile/log evidence. This fix does not claim a new full-settings visual retest; its separate actual WebView bootstrap regression and Global UI build passed. The shared settings UI/persistence implementation is unchanged.

The fix changes these 27 files; generated executables, private profiles and evidence logs remain ignored:

- `docs/step-7.5.md`
- `docs/step7-verification.md`
- `native/fps-bridge/LICENSE.steam`
- `native/fps-bridge/README.md`
- `native/fps-bridge/bridge.c`
- `native/fps-bridge/build-record.json`
- `native/fps-bridge/fixture.c`
- `native/fps-bridge/steam-artifacts.json`
- `native/fps-bridge/steam-fixture.c`
- `native/fps-bridge/steam-source.md`
- `native/fps-bridge/steam.c`
- `scripts/build-fps-bridge.cjs`
- `scripts/runtime-fixture.ts`
- `scripts/test-fps-bridge.cjs`
- `scripts/test-runtime-fixture.cjs`
- `src/clients/mhy/hk4e/fps-admission.spec.ts`
- `src/clients/mhy/hk4e/fps-admission.ts`
- `src/clients/mhy/hk4e/fps-bridge-manifest.ts`
- `src/clients/mhy/hk4e/fps-bridge.ts`
- `src/clients/mhy/hk4e/fps-integration-fixture.ts`
- `src/clients/mhy/hk4e/fps-integration.spec.ts`
- `src/clients/mhy/hk4e/fps-steam.ts`
- `src/clients/mhy/hk4e/launch-fps-game.spec.ts`
- `src/clients/mhy/hk4e/launch-fps-game.ts`
- `src/clients/mhy/hk4e/program-launch-game.spec.ts`
- `src/clients/mhy/hk4e/program-launch-game.ts`
- `src/clients/mhy/hk4e/steam-patch-journal.spec.ts`

### Manual status and evidence to collect next

Disabled baseline, enabled 60/61/120, real world load and measured FPS remain **not run** for this fix. Existing Global provenance acceptance/authorization is retained; the operator alone presses Launch. Keep Steam Patch **on**, block-hosts Launch Fix **off**, and use the existing development loader `/Users/david/code/home/yaagl_vibecoding/yet-another-anime-game-launcher/yaaglwdos/wine/bin/wine` with prefix `/Users/david/code/home/yaagl_vibecoding/yet-another-anime-game-launcher/yaaglwdos/wineprefix`. Do not manufacture `wine64`, copy/reset the prefix or accept runtime replacement. The game still resides in shared `/Users/david/.gimpact`; use the read-only file snapshots above before/after each run.

The fix logs `route=steam-patch` in the request header, protocol version 2 with distinct stable game `pid`/`shimPid`, `steamReady`, `shimExited`, `steamActive` and `steamError`, plus explicit registry owned-completion, request-owned Wine-wait start/completion and final registry/file/private cleanup completion. These replace the preflight's absence of separate success messages. Logs are supplementary evidence; a vanished window, PID snapshot or command return alone still does not prove cleanup.

After each normal game exit require game `primaryExited:1`/`active:0`, shim `shimExited:1`/`steamActive:0`, zero error fields, worker completion, released bridge and confirmed supervisor/direct child, completed Wine waits, exact registry and journal restoration, and guard release. Preserve any retained request `response`, `journal.json`, `file-N`, `registry-N` and owned-supervisor mailbox paths. For the disabled baseline, the stronger bridge fields do not exist: require its normal command/Wine waits, journal restoration and guard release instead.

Send the disabled report first, then enabled 60 with full `yaaglwdos/neutralinojs.log`, new `yaaglwdos/logs/game_*.log` and adjacent enabled `*.log.steam.log`, DXMT logs, terminal output, settings/graphics/FPS/world-load observations, before/after file evidence and any visible errors/retained paths. Review those before 61/120. Normal close blocked during game/pending cleanup is expected. Stop on uncertain lifetime, crash, failed restoration or unconfirmed cleanup; never force a release or terminate shared Wine. FPS below a cap alone is not evidence of a worker defect. Packaged-app testing remains a later Step 8 gate.

## Original Step 7 changed files (historical)

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
