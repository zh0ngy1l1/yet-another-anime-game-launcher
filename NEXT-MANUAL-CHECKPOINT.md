# Manual checkpoint: direct Steam creation candidate

This candidate changes enabled startup: the unchanged signed Steam shim creates
**the actual game**, and the bridge validates and retains its child HANDLE.
Fixture tests cover worker writes above 60, ownership, failure handling and
restoration. **The game crash is not yet verified fixed.** See the
[investigation and limits](docs/fps-direct-steam-candidate-20260913.md).

Use the **development launcher and existing `yaaglwdos` profile** for the stages
below. Keep Steam Patch **ON**, Launch Fix/block hosts **OFF**, the same game,
Wine, DXMT 0.80.0, timeout fix, Metal HUD and other settings. Do not install a Wine
candidate, update/repair the game, run historical scripts or change security
metadata. Existing provenance acceptance remains recorded. You operate the game.

## Stop conditions

If any launcher shows an unresolved lifetime or cleanup guard, leave it open,
collect evidence using the command below and stop. Do not force release, delete
request/journal files, issue protocol commands or launch another game. Any crash,
failed ownership/signature/write, artifact mismatch, unknown lifetime or missing
cleanup acknowledgement ends this checkpoint. Do not advance to the next stage.
If the game is still responsive after a failure, capture live evidence and quit
the game normally. Keep the launcher open until its cleanup is confirmed.

The new ownership check deliberately rejects a descendant created before the
initial child HANDLE is established (`Steam ownership rejected total=...` or
`Steam game admission failed`). Preserve that result; do not retry with weaker
checks. A game that exits too quickly to identify is a failed launch, not a pass.

## 1. Open this exact development build

Paste in Terminal. This opens the UI; press Launch only at the stage specified
below. Verify **Node v16.20.2 / pnpm 7.33.7**. HEAD must match the delivery's commit
and the packaged build record; the check below stops on mismatch.

```sh
cd /Users/david/code/home/yaagl_vibecoding/yet-another-anime-game-launcher
export PATH="/Users/david/.npm/_npx/b620232375418b77/node_modules/.bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"
node --version
pnpm --version
git show -s --format='%H %s' HEAD
python3 - <<'PY' && {
import json, subprocess
from pathlib import Path
assert subprocess.check_output(['node','--version'], text=True).strip() == 'v16.20.2'
assert subprocess.check_output(['pnpm','--version'], text=True).strip() == '7.33.7'
assert not subprocess.check_output(['git','status','--porcelain'], text=True).strip(), 'Preserve local changes and stop for review'
record = Path('/Users/david/Library/Application Support/YAAGL Local Builds/fps-creation-review-20260913T190131Z/package/Yaagl OS.app/Contents/Resources/manifests/build.json')
expected = json.loads(record.read_text())['sourceCommit']
actual = subprocess.check_output(['git','rev-parse','HEAD'], text=True).strip()
assert actual == expected, (actual, expected)
print('Candidate source:', expected)
PY
YAAGL_FPS_CAPTURE_DIR="$(mktemp -d /tmp/yaagl-fps-console.XXXXXX)"
printf 'Console evidence: %s\n' "$YAAGL_FPS_CAPTURE_DIR"
set -o pipefail
pnpm start-hk4eos 2>&1 | tee "$YAAGL_FPS_CAPTURE_DIR/terminal.log"
python3 scripts/collect-hk4e-launch-evidence.py --console "$YAAGL_FPS_CAPTURE_DIR"
}
```

The start command rebuilds and copies this candidate's resources. The last
collector runs after normal launcher exit and prints a fresh evidence path.
Repeat this block for each stage, keeping every printed console/evidence path.
Do not use an older open launcher window.

Before pressing Launch, use a second terminal to verify the actual development
artifacts. This only reads files:

```sh
cd /Users/david/code/home/yaagl_vibecoding/yet-another-anime-game-launcher
python3 - <<'PY'
import hashlib
from pathlib import Path
expected = {
 'yaaglwdos/sidecar/fps-bridge/fps-bridge.exe': '12db0203a736f56b51c424c3ad26d2efbbdae4b5b870b8f62df639b024e182ba',
 'yaaglwdos/sidecar/protonextras/steam64.exe': '0424339444c54bf1f9fdbadf12e4e2c90ceef41d987fe573b93f5f2ebfd8a657',
 'yaaglwdos/sidecar/protonextras/lsteamclient64.dll': 'af50ed0d952ef98d99d4d3ff67b4836b545c9403894430fca31969f9f630637b',
 'yaaglwdos/wine/lib/wine/x86_64-unix/ntdll.so': 'f26ade35f5b49e33b3780b6adc71f9eb9c831ea40222c1bae667ac14135d984b',
 'bin/hk4e-neutralino-arm64': '3e04ed4a6d2b5389d7dbe525367881a08a5081314ef6dddf973227a66a3857e1',
}
for name, wanted in expected.items():
 p = Path(name)
 actual = hashlib.sha256(p.read_bytes()).hexdigest()
 assert actual == wanted, (name, actual, wanted)
 print(p.stat().st_size, actual, name)
PY
```

Bridge is protocol 3, **36,864 bytes**. Selected Wine remains the original library;
this test does not install the historical correction.

## 2. Fresh disabled control — first and once

Set **FPS unlocking OFF**, leave the stored target **60**, verify Steam Patch ON
and Launch Fix OFF, record wall-clock time, and press **Launch once**.

If login appears, keep it stable for **30 seconds**. Record the numerical HUD FPS
and take a live evidence capture using step 5 before quitting. Quit the game
normally, wait for cleanup, then close the launcher normally and keep the final
capture. If the control crashes or cleanup is unresolved, stop and return both
captures; do not run enabled 60.

This control is necessary because the earlier disabled success was reported on
an earlier run. No newer disabled attempt was found, despite the current stored
FPS setting being off. It determines whether direct Steam still works with this
exact current game/runtime. A matching failure would weaken an enabled-only
explanation; fixtures cannot execute the game's protection/renderer startup.

Disabled control passes this stage only with stable login, normal operator exit,
and this run's final launcher-log line:
`Wine wait, registry/file restoration and journal cleanup completed`.
The new disabled log is `yaaglwdos/logs/game_<timestamp>.log`; there is no FPS
worker and no expected new `.wine.log`. Preserve handled exceptions as well;
an exception trace alone is not automatically a failed run.

## 3. Enabled 60 — only after stage 2 and cleanup pass

Reopen the same candidate using step 1. Change only **FPS unlocking ON**, target
**60**. Verify Steam Patch ON / Launch Fix OFF. Record time and press Launch once.

Reach login, keep it stable for at least **30 seconds**, and capture evidence
while it is still running. In this run's `.wine.log`, require:

- `Steam direct creation` and `Steam ready ... retained direct child ... totalProcesses=2`;
- `game adopted game=<PID>` matching the game PID in this request's launcher status;
- `worker start requested generation=1 ... target=60` and `worker applying`;
- a successful `read ... value=60 target=60 action=equal` (a preceding successful
  four-byte write is allowed if the value initially differed).

The launcher status should show generation at least 1, workerState 2 while
applying and no worker/launch error. **Generation 0 or login alone is not a
worker pass.** At 60, compare-equal without writing is correct behavior.

Quit normally and require the cleanup gates in step 6 before advancing. On any
failure, collect and stop. In particular, a new fault after a recorded write is
different evidence from the earlier generation-0 crash and may reopen the
historical Wine protection question.

## 4. Enabled 120 — only after stage 3 and cleanup pass

Reopen the same candidate. Change only the FPS target to **120**, leaving unlocking
ON, Steam Patch ON and Launch Fix OFF. Launch once. Verify the same game/worker
identity gates as stage 3 with `target=120`; game DXMT maximum should be **0**.

Log in and enter the game world. Use a stationary, repeatable scene and observe
it for **60 seconds**. Record the numerical Metal HUD FPS minimum/typical/maximum
and a screenshot or short recording. Require FPS **sustained above 60** with the
worker applying, a successful `write end ... ok=1 written=4` when a change was
needed, and subsequent `read ... value=120 target=120 action=equal`.

A displayed target, a successful memory write, login-screen FPS, or frame rate
remaining at/below 60 does **not** establish above-60 gameplay. GPU load or game
settings may limit achieved FPS; report the observed range without marking it a
pass or changing other variables during this comparison. Capture live evidence,
quit normally, and require step 6. Do not try 61, additional targets or repeat
failed attempts under this checkpoint.

## 5. Preserve live and final evidence

In a second terminal, run this while the game is stable **before normal exit**,
or immediately if anything fails/gets guarded:

```sh
cd /Users/david/code/home/yaagl_vibecoding/yet-another-anime-game-launcher
python3 scripts/collect-hk4e-launch-evidence.py
```

Keep its printed path. A live capture preserves retained request responses,
registry snapshots and file-journal preimages before normal cleanup removes them.
Run the collector again after cleanup/normal UI exit (step 1 does that with the
exact console directory). Keep both captures. The collector only reads sources
and creates new evidence; it sends no protocol/process commands and uploads
nothing. Missing or changing files are recorded explicitly.

To inspect only the latest run's relevant diagnostics:

```sh
cd /Users/david/code/home/yaagl_vibecoding/yet-another-anime-game-launcher
python3 - <<'PY'
from pathlib import Path
import re
epochs = [int(m.group(1)) for f in Path('yaaglwdos/logs').glob('game_*.log*')
          if (m := re.fullmatch(r'game_(\d+)\.log(?:\.(?:wine|steam)\.log)?', f.name))]
p = Path('yaaglwdos/logs') / f'game_{max(epochs)}.log'
print('Latest run:', p)
wine = Path(str(p) + '.wine.log')
for f in [p, Path(str(p)+'.steam.log'), wine]:
 print('LOG', f, 'bytes', f.stat().st_size if f.exists() else 'missing')
 if f.exists():
  for line in f.read_text(errors='replace').splitlines():
   if re.search(r'Steam direct|Steam ready|ownership|admission|game adopted|worker |read generation|write (begin|end)|game exit|initDriver|WDFLDR|HoYoProtect|c0000005', line):
    print(line)
print('Final launcher records (check this request identity, not an older run):')
for line in Path('yaaglwdos/neutralinojs.log').read_text(errors='replace').splitlines()[-120:]:
 if re.search(r'FPS request|HK4E disabled request|cleanup|restoration|supervisor|Wine wait', line):
  print(line)
PY
```

Preserve the **full** launcher log, `.log`, `.steam.log`, `.wine.log`, terminal and
DXMT output, new game/macOS crash reports, retained request files, cleanup
acknowledgements and journal/registry evidence. Absent or empty Win32 game output can be
normal for the directly created GUI game; it does not replace `.wine.log`.
Missing write lines do not prove no writes by other components.

## 6. Cleanup and restoration gate after each enabled stage

For the same request/token and game PID, require:

- retained game exit known (normal exit code 0), workerDone 1, game job `active=0`,
  `steamActive=0`, shimExited 1 and `released=1`;
- foreground Wine supervisor completion confirmed, then the first request-owned
  Wine wait, registry restoration acknowledgement, the second Wine wait, and
  `registry/file restoration and private resource cleanup completed`;
- normal launcher close available, no unresolved guard, and no lingering patch
  warning. Preserve the live snapshot and final capture for independent comparison
  of restoration with the journal preimages. Do not delete remaining snapshots.

An error saying `Cleanup completed` records restoration completion, not a
successful game run. If any acknowledgement is missing or lifetime remains
unknown, collect and stop without forcing cleanup or starting the next stage.

Return each stage's start/exit times, evidence paths, login/worker results, HUD
measurements, full visible error if any and cleanup result. This checkpoint
requires new evidence before the crash or above-60 gameplay can be accepted.

## Packaged deliverable — separate, not the test profile above

Actual Global bundle:

`/Users/david/Library/Application Support/YAAGL Local Builds/fps-creation-review-20260913T190131Z/package/Yaagl OS.app`

It contains the matching ARM64 native executable, x64 bridge/unchanged signed
Steam pair, complete Sophon resources, manifests and licenses. The outer app is
unsigned/not notarized; the native executable retains its ad-hoc signature.
Intel helpers need Rosetta. No Wine/profile/game data is bundled. Existing signed
xdelta3 still needs the unavailable Intel `/usr/local/opt/xz/lib/liblzma.5.dylib`;
legacy xdelta updates are limited, while packaged Sophon health was checked.

Its wrapper uses the separate `~/Library/Application Support/Yaagl OS FPS Review`
profile. **Do not use it for these development comparisons or configure/install
another Wine to bypass a failed stage.** Packaged gameplay remains unrun and
requires separate profile/runtime preparation and an operator checkpoint after
the development results are reviewed. Building the app is not a gameplay pass.

Prior results remain distinct: earlier operator-reported disabled pass with
logged restoration; private and canonical enabled-60 failures; enabled-120
failure; no accepted enabled-61 result; packaged gameplay unrun. No Native
Fullscreen or Game Mode work is requested.
