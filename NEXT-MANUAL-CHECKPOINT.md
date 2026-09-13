# One next manual checkpoint: corrected Steam image, enabled 60

The previous enabled-60 attempt **failed** during protection-driver initialization, before the FPS worker started. Its cleanup is confirmed by logs. This build corrects the enabled shim's image path and adds exception/evidence capture; a real-game fix is **not yet verified**. The [follow-up report](docs/fps-enabled60-followup-20260913.md) contains the diagnosis, limits and regression results. The earlier evidence and checkpoint remain preserved externally.

Use the existing **development profile**, game, Wine and DXMT for this comparison. Leave **Steam Patch on**, **Launch Fix/block hosts off**, **FPS unlocking on, target 60**, DXMT 0.80.0, timeout fix and Metal HUD as before. Do not install the archived Wine candidate or use the separate packaged app for this attempt. Existing provenance authorization remains recorded; you operate the game.

1. If the launcher is already showing an unresolved request/cleanup guard, skip launch and run the collector in step 4 from another terminal. Keep that launcher open; do not force release, delete request files or retry the game.

2. Otherwise start the updated development launcher with console capture. Paste these commands in Terminal:

```sh
cd /Users/david/code/home/yaagl_vibecoding/yet-another-anime-game-launcher
export PATH="/Users/david/.npm/_npx/b620232375418b77/node_modules/.bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"
node --version
pnpm --version
YAAGL_FPS_CAPTURE_DIR="$(mktemp -d /tmp/yaagl-fps-console.XXXXXX)"
printf 'Console evidence: %s\n' "$YAAGL_FPS_CAPTURE_DIR"
set -o pipefail
pnpm start-hk4eos 2>&1 | tee "$YAAGL_FPS_CAPTURE_DIR/terminal.log"
python3 scripts/collect-hk4e-launch-evidence.py --console "$YAAGL_FPS_CAPTURE_DIR"
```

Expected versions are **v16.20.2 / 7.33.7**. Starting prepares the current bridge and matching native resources, then opens the UI. The last command runs automatically after the launcher exits, even if pnpm reports an error; it prints the new evidence directory. If either version differs, stop before Launch.

Before pressing Launch, verify in a second terminal:

```sh
cd /Users/david/code/home/yaagl_vibecoding/yet-another-anime-game-launcher
shasum -a 256 yaaglwdos/sidecar/fps-bridge/fps-bridge.exe yaaglwdos/wine/lib/wine/x86_64-unix/ntdll.so
```

Expected bridge: **`d7aa8ac472c5757f4d96847b626fe7b955e9ff6184940bc17b32f66c5900873d`**, protocol 3, 37,888 bytes. Expected selected Wine library: **`f26ade35f5b49e33b3780b6adc71f9eb9c831ea40222c1bae667ac14135d984b`**. On mismatch, collect evidence and stop before Launch.

3. Check the settings above, record wall time, and press **Launch once**. Record whether login appears and any numerical Metal HUD FPS value. If login remains stable for **30 seconds**, quit the game normally. If it fails, stop after that attempt. Let the launcher finish cleanup; close the launcher normally only when it allows this. A stable login alone does not accept world gameplay, target 61/120 or measured unlocking above 60.

4. If the launcher remains guarded or has not exited, collect immediately from another terminal:

```sh
cd /Users/david/code/home/yaagl_vibecoding/yet-another-anime-game-launcher
python3 scripts/collect-hk4e-launch-evidence.py
```

This command only reads sources and writes a fresh private evidence directory. It automatically captures the full launcher log, all adjacent game/Steam/Wine logs, timestamp-matched terminal captures and macOS reports, game `driverError.log`, game logs/dumps, selected settings/artifact hashes, and any exact retained request directories referenced by the launcher log. Missing, changing or symlink entries are recorded explicitly; no cleanup or protocol command is sent. A second collection after eventual safe cleanup is allowed and creates another directory. Keep both.

5. Send the printed evidence directory path plus your start time, visible error text, whether login stayed up, any HUD FPS value, and whether normal cleanup/close became available. The files are local; no upload is automatic. Do not publish the raw logs broadly because game logs can contain private information.

The evidence should show `verified Steam execution pair`, `Steam ready ... image=C:\windows\system32\steam.exe`, game PID/parent and DXMT maximum 60, any worker generation/resolution/read/write records, Wine exception details, game exit status, both jobs empty, release, owned supervisor completion, both Wine waits and registry/file restoration. `+seh` includes handled exceptions too; a trace line alone does not establish a fatal fault. If the same driver error recurs, the retained exception instruction/stack may distinguish the remaining creation-context and Wine-runtime explanations.

Current acceptance: disabled launch/normal exit reported with logged restoration; enabled 120 failed; the previous enabled 60 failed; enabled 61 has no accepted operator result; packaged gameplay remains unrun. Do **not** proceed to another target or packaged game until this single result is reviewed. No Native Fullscreen or Game Mode testing is requested.
