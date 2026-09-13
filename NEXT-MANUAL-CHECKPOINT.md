# Manual checkpoint: Steam bootstrap and desktop lifetime candidate

Use the **development launcher with the existing `yaaglwdos` profile** below.
This candidate keeps genuine canonical Steam as Wine's initial process, validates
that bootstrap, prepares Wine's desktop before game creation, and retains the
inner signed Steam/game HANDLE and strict job ownership. Worker diagnostics are
now flushed to **`.bridge.log`**, separately from `.wine.log`.

The investigation and autonomous results are in
[docs/fps-direct-creation-failure-20260913.md](docs/fps-direct-creation-failure-20260913.md).
The intermediate candidate reached the start screen with an active worker; its
cleanup needed a documented desktop recovery. The final desktop correction passed
fixtures. Its game preflight stopped because the desktop locked again, before any
game launch. Follow the stages below; neither that intermediate result nor fixtures
verify the final rendered development launcher or packaged app.

Keep **Steam Patch ON**, **Launch Fix/block hosts OFF**, the same Global 7.0.0
game, selected Wine, DXMT 0.80.0, timeout fix, Metal HUD and other settings.
No Native Fullscreen or Game Mode changes. Do not install the offline Wine
candidate, update/repair the game, run historical or diagnostic recovery helpers,
or alter security metadata. Existing provenance acceptance remains recorded.

## Stop conditions

Any artifact mismatch, crash, ownership/signature/write/logging error, unknown
lifetime or unresolved cleanup stops this checkpoint. Do not advance or retry.
If the game remains responsive, capture live evidence and quit it normally.
Keep the launcher open while it observes cleanup. Do not force release, terminate
Wine, delete request/journal files or issue protocol commands. Capture evidence
and return the full visible error if the guard remains unresolved.

A `Steam bootstrap rejected` error means the required fresh Wine creation context
was not established; it is a failed admission with no new game expected. Preserve
it rather than bypassing the check. A successful restoration message after an
error establishes cleanup, not successful gameplay.

## 1. Open and identify this exact development candidate

Close any older launcher normally first, after its cleanup is confirmed. Paste
this block in Terminal; it opens the launcher UI, **not the game**. Do not press
Launch until step 2. The block refuses a source mismatch or local modifications
instead of discarding them.

```sh
cd /Users/david/code/home/yaagl_vibecoding/yet-another-anime-game-launcher
export PATH="/Users/david/.npm/_npx/b620232375418b77/node_modules/.bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"
python3 - <<'PYCODE' && {
import json, subprocess
from pathlib import Path
assert subprocess.check_output(['node','--version'], text=True).strip() == 'v16.20.2'
assert subprocess.check_output(['pnpm','--version'], text=True).strip() == '7.33.7'
assert not subprocess.check_output(['git','status','--porcelain'], text=True).strip(), 'Preserve changes and stop for review'
p = Path('/Users/david/Library/Application Support/YAAGL Local Builds/fps-direct-failure-20260913T204809Z/package/Yaagl OS.app/Contents/Resources/manifests/build.json')
record = json.loads(p.read_text())
head = subprocess.check_output(['git','rev-parse','HEAD'], text=True).strip()
assert head == record['sourceCommit'], (head, record['sourceCommit'])
assert record['bridge']['sha256'] == 'be4b09a0dea1aca9252a1297f1a0c26a46a67d564b9027f547e64b2bb71faa25'
print('Candidate source:', head)
print('Node 16.20.2 / pnpm 7.33.7 verified')
PYCODE
YAAGL_FPS_CAPTURE_DIR="$(mktemp -d /tmp/yaagl-fps-console.XXXXXX)"
printf 'Console evidence: %s\n' "$YAAGL_FPS_CAPTURE_DIR"
set -o pipefail
pnpm start-hk4eos 2>&1 | tee "$YAAGL_FPS_CAPTURE_DIR/terminal.log"
python3 scripts/collect-hk4e-launch-evidence.py --console "$YAAGL_FPS_CAPTURE_DIR"
}
```

Keep the printed console path. The final collector runs after normal launcher
exit and prints a new evidence path. Repeat this opening block for each stage.
The start command rebuilds/copies the committed resources before showing the UI.

Before pressing Launch, paste this read-only artifact check into a second terminal:

```sh
cd /Users/david/code/home/yaagl_vibecoding/yet-another-anime-game-launcher
python3 - <<'PYCODE'
import hashlib
from pathlib import Path
expected = {
 'yaaglwdos/sidecar/fps-bridge/fps-bridge.exe': (38912, 'be4b09a0dea1aca9252a1297f1a0c26a46a67d564b9027f547e64b2bb71faa25'),
 'yaaglwdos/sidecar/protonextras/steam64.exe': (111304, '0424339444c54bf1f9fdbadf12e4e2c90ceef41d987fe573b93f5f2ebfd8a657'),
 'yaaglwdos/sidecar/protonextras/lsteamclient64.dll': (5560872, 'af50ed0d952ef98d99d4d3ff67b4836b545c9403894430fca31969f9f630637b'),
 'yaaglwdos/wine/lib/wine/x86_64-unix/ntdll.so': (620688, 'f26ade35f5b49e33b3780b6adc71f9eb9c831ea40222c1bae667ac14135d984b'),
 'bin/hk4e-neutralino-arm64': (2004496, '3e04ed4a6d2b5389d7dbe525367881a08a5081314ef6dddf973227a66a3857e1'),
}
for name, wanted in expected.items():
 p = Path(name)
 actual = (p.stat().st_size, hashlib.sha256(p.read_bytes()).hexdigest())
 assert actual == wanted, (name, actual, wanted)
 print(*actual, name)
PYCODE
```

Bridge is protocol 3, GUI subsystem, **38,912 bytes**. Old hashes `12db…`,
`d7aa…` and intermediate `dd1ee…` are not this candidate. Selected Wine remains
the original library; the separate R2 candidate is excluded from this comparison.

## 2. Enabled 60: startup, worker and automatic cleanup first

The fresh disabled control you already completed is recorded as a separate pass
with logged restoration. Another disabled run is not required for this checkpoint.
Set **FPS unlocking ON, target 60**, verify Steam Patch ON / Launch Fix OFF,
record wall-clock time and press **Launch once**.

Reach the login/start screen and keep it stable for **30 seconds**. Record the
numerical Metal HUD FPS. While it is stable, collect live evidence with step 4.
This run's `.bridge.log` must show:

- `Steam bootstrap retained parent=32 image=C:\windows\system32\steam.exe`;
- `desktop prepared` before `Steam direct creation`, with both job membership
  fields zero and error zero;
- `Steam ready ... retained direct child ... totalProcesses=2` and `game adopted`
  matching the game PID/token in this request's launcher status;
- `worker start requested generation=1 ... target=60`, `worker applying`, and a
  successful `read ... value=60 target=60 action=equal`. If the initial value
  differs, a preceding four-byte `write end ... ok=1 written=4` is expected.

The request status must show generation at least 1, workerState 2 while applying,
and workerError/launchError/steamError/diagnosticError zero. Generation 0 or login
alone is not a worker pass. Compare-equal at 60 without a write is also correct.
Quit the game normally, wait for step 5's complete automatic cleanup, then close
the launcher normally and retain the final capture. **Do not proceed to 120
unless startup, worker and cleanup all pass without intervention.**

## 3. Enabled 120: actual above-60 gameplay

Reopen using step 1. Change only the FPS target to **120**, leaving unlocking ON.
Record time and Launch once. Require the same identity, desktop and worker gates
with target 120. The bridge's game DXMT configuration must show
`d3d11.preferredMaxFrameRate=0`.

Enter the game world. Observe a stationary, repeatable scene for **60 seconds**.
Record the numerical Metal HUD FPS minimum/typical/maximum and a screenshot or
short recording. Require FPS sustained above 60 while the worker applies, a
successful four-byte write when needed, and subsequent
`read ... value=120 target=120 action=equal`.

Login-screen FPS, a displayed target or a successful memory write alone is not
an above-60 gameplay pass. If achieved FPS stays at/below 60, report it as
unverified and keep the other settings unchanged. Capture live evidence, quit
normally, and require step 5. Do not try 61, additional targets or repeat a failed
attempt. The original Wine has a separately documented post-write protection
hazard; a new fault after a recorded write is different evidence from the old
generation-0 crash. Preserve it and stop.

## 4. Preserve live and final evidence

In the second terminal, run this while the game is stable before normal exit,
or immediately after a failure/guard:

```sh
cd /Users/david/code/home/yaagl_vibecoding/yet-another-anime-game-launcher
python3 scripts/collect-hk4e-launch-evidence.py
```

Keep its printed path. The collector reads sources, copies full logs and retained
request/journal/registry files into fresh evidence, and records missing/changing
files. It sends no protocol or process commands and uploads nothing. Run it again
after cleanup; step 1 does that automatically with the exact console directory.
Full Wine exception logs can grow quickly; collect promptly and finish the stated
observation period instead of leaving the game idle for an extended session.

This read-only summary selects the newest run, including bridge-only logs:

```sh
cd /Users/david/code/home/yaagl_vibecoding/yet-another-anime-game-launcher
python3 - <<'PYCODE'
from pathlib import Path
import re
logs = Path('yaaglwdos/logs')
epochs = [int(m.group(1)) for p in logs.glob('game_*.log*')
          if (m := re.fullmatch(r'game_(\d+)\.log(?:\.(?:wine|steam|bridge)\.log)?', p.name))]
assert epochs, 'No game evidence found'
base = logs / f'game_{max(epochs)}.log'
print('Latest run:', base)
for p in [base, Path(str(base)+'.steam.log'), Path(str(base)+'.wine.log'), Path(str(base)+'.bridge.log')]:
 print('LOG', p, 'bytes', p.stat().st_size if p.exists() else 'missing')
 if p.name.endswith('.bridge.log') and p.exists():
  print(p.read_text(errors='replace'))
p = Path('yaaglwdos/neutralinojs.log')
print('Recent launcher records; correlate the exact token and game PID:')
for line in p.read_text(errors='replace').splitlines()[-160:]:
 if re.search(r'FPS request|cleanup|restoration|supervisor|Wine wait', line):
  print(line)
PYCODE
```

Retain full launcher/game/Steam/**Wine and bridge** logs, terminal/DXMT output,
new game/macOS crash reports, request responses, cleanup acknowledgements,
journal preimages and registry snapshots. Absent/empty directly created GUI game
output can be normal; it does not replace `.wine.log` or `.bridge.log`. Missing
write lines do not prove no writes by other components.

## 5. Cleanup and restoration gate after each stage

For the same request token/game PID, require all of these, without recovery:

- Known normal game exit code 0, workerDone 1, game job active 0, steamActive 0,
  shimExited 1 and released 1.
- Foreground Wine supervisor confirmed, first request-owned Wine wait completed,
  registry restoration acknowledged, second Wine wait completed, then
  `registry/file restoration and private resource cleanup completed`.
- Normal launcher close available, no unresolved lifetime guard or patch warning.

Keep the live preimages and final capture for independent restoration comparison.
Do not delete remaining snapshots. Return each stage's start/exit times, evidence
paths, login and worker result, HUD range, full visible error and cleanup result.

## Actual packaged deliverable: separate profile, separate checkpoint

`/Users/david/Library/Application Support/YAAGL Local Builds/fps-direct-failure-20260913T204809Z/package/Yaagl OS.app`

This Global bundle contains the matching ARM64 native runtime, x64 bridge,
unchanged signed Steam pair, all Sophon resources, manifests and licenses. The
outer app is unsigned/not notarized; native retains its existing ad-hoc signature.
Intel helpers require Rosetta. No Wine, private profile or game data is bundled.
The existing signed xdelta3 requires the unavailable Intel
`/usr/local/opt/xz/lib/liblzma.5.dylib`, limiting legacy xdelta updates; Sophon is
independent and its packaged health is checked.

The wrapper uses `~/Library/Application Support/Yaagl OS FPS Review`.
**Do not open/configure this separate profile for the development comparison
above.** Packaged gameplay remains unrun and needs its own runtime/profile
preparation after development results are reviewed. Building the bundle is not
a gameplay pass. The offline runtime candidate and diagnostic recovery helpers
are not included or authorized installation steps in this checkpoint.
