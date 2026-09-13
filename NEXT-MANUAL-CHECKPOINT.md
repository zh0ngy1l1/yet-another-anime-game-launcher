# Next checkpoint: one fresh FPS-disabled control

The canonical Steam enabled-60 attempt failed again. Its exception is a **write to `0x1000` before the FPS worker starts**, distinct from the documented historical FPS-page read fault. The launcher did finish cleanup; its duplicate “cleanup” error label was misleading and is now fixed. The [current investigation](docs/fps-canonical60-investigation-20260913.md) contains the evidence and limits.

**An enabled-game crash fix is not yet established.** The tested changes fix reporting and capture exception/module evidence. This single control determines whether direct Steam creation still succeeds with the current game/Wine. Turning FPS off here is a diagnostic comparison, not the implementation of a workaround or replacement for automatic unlocking.

Use the existing **development profile**. Do not run the packaged app for this comparison. No Wine replacement, driver installation, security metadata change or historical deployment is needed. Existing provenance acceptance remains recorded; you alone operate the game.

1. If any launcher is showing an unresolved lifetime/cleanup guard, keep it open and run the collector in step 5 from a second terminal. Do not force release, delete request files, launch another game or bypass that guard. Otherwise continue.

2. Paste the following in Terminal. Verify the printed versions are **Node v16.20.2 / pnpm 7.33.7** before proceeding to Launch. The printed Git identity should match the commit reported with this delivery.

```sh
cd /Users/david/code/home/yaagl_vibecoding/yet-another-anime-game-launcher
export PATH="/Users/david/.npm/_npx/b620232375418b77/node_modules/.bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"
node --version
pnpm --version
git show -s --format='%H %s' HEAD
YAAGL_FPS_CAPTURE_DIR="$(mktemp -d /tmp/yaagl-fps-console.XXXXXX)"
printf 'Console evidence: %s\n' "$YAAGL_FPS_CAPTURE_DIR"
set -o pipefail
pnpm start-hk4eos 2>&1 | tee "$YAAGL_FPS_CAPTURE_DIR/terminal.log"
python3 scripts/collect-hk4e-launch-evidence.py --console "$YAAGL_FPS_CAPTURE_DIR"
```

The start command rebuilds the current Global development resources and opens the UI. The final collector command runs after the launcher exits and prints a fresh evidence directory. If the UI remains guarded, use step 5 while leaving it open.

3. Before pressing Launch, verify the unchanged bridge/Wine identities in a second terminal:

```sh
cd /Users/david/code/home/yaagl_vibecoding/yet-another-anime-game-launcher
shasum -a 256 yaaglwdos/sidecar/fps-bridge/fps-bridge.exe yaaglwdos/wine/lib/wine/x86_64-unix/ntdll.so
```

Bridge: **`d7aa8ac472c5757f4d96847b626fe7b955e9ff6184940bc17b32f66c5900873d`**, protocol 3 / 37,888 bytes. Selected Wine library: **`f26ade35f5b49e33b3780b6adc71f9eb9c831ea40222c1bae667ac14135d984b`**. This delivery changes frontend reporting/logging, not those binaries. On mismatch, collect and stop before Launch.

4. In the existing settings set **FPS unlocking OFF**. Keep the stored target **60** unchanged. Keep **Steam Patch ON**, **Launch Fix/block hosts OFF**, the same game/path, selected Wine, DXMT 0.80.0, timeout fix and Metal HUD. Do not update or repair the game/runtime for this comparison. Record wall time, then press **Launch once**.

If login appears, leave it stable for **30 seconds**, record any numerical HUD FPS value, and quit the game normally. If it fails, record the full visible error and stop after that attempt. Allow normal cleanup to finish; close the launcher normally only when permitted. Do **not** follow this with an enabled, higher-target or packaged-game attempt yet.

5. If the launcher remains open/guarded, or you need an immediate capture, run in another terminal:

```sh
cd /Users/david/code/home/yaagl_vibecoding/yet-another-anime-game-launcher
python3 scripts/collect-hk4e-launch-evidence.py
```

The collector only reads sources and writes a new private evidence directory. It preserves full launcher/game logs, matching terminal captures, game `driverError.log`, game/macOS crash reports, selected settings/artifact identities, and any retained exact `/tmp/yaagl-launch.*`, `/tmp/yaagl-fps.*` or owned-Wine directories referenced by the log. Templates and unrelated fixture directories are excluded. Missing/unstable/symlink sources are recorded; it sends no process or protocol commands. A later collection after safe cleanup creates a separate directory and is allowed.

For this **disabled** control, Wine exception and module records are in the new `game_<timestamp>.log`; a new `.wine.log` or FPS worker is not expected. The command log should include `WINEDEBUG=...+seh,+loaddll`, an `HK4E disabled request` identifying this run, and a final `Wine wait, registry/file restoration and journal cleanup completed` line if cleanup finishes. Handled exceptions can appear in successful runs. Do not classify every trace line as fatal.

6. Return the printed evidence path, start time, whether login remained stable, any HUD FPS value, full visible error if present, and whether cleanup/normal launcher close became available. The collector does not upload anything. Preserve raw logs locally because they can contain private game information.

Interpretation: a successful contemporary disabled control strengthens the remaining enabled creation-context explanation; a matching disabled write-to-`0x1000`/driver failure points toward a common current game/Wine condition. Neither alone accepts enabled FPS gameplay. A new module-load map can identify this run's fault module if an exception recurs; it is not a crash-time memory dump.

Status remains: earlier disabled operator pass with logged restoration; two enabled-60 failures (private and canonical shim); enabled-120 failure; no accepted enabled-61 result; packaged gameplay unrun. No Native Fullscreen or Game Mode testing is requested.
