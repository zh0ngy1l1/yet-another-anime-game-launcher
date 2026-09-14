# Manual checkpoint: hidden startup and delayed-crash diagnostics

**The exact next action is the launcher-only check in steps 1–2.** This task did
not start any launcher, game, hidden/WebView/RPC harness or privileged helper.
The new bundle has automated/static validation; visual behavior and gameplay
remain operator checks. Do not automatically advance after a failure.

The additional target-150 crash is preserved. A fatal game read on the FPS
integer's page occurred in the same millisecond as the seventh successful write;
error 87 followed about two seconds later. The original Wine protection race is
the leading explanation, but its transient page state was not captured in that
run. **This package adds diagnostics and launcher corrections, not an installed
Wine fix or a claim of crash-free gameplay.** See
[the investigation](docs/fps-delayed-crash-investigation-20260914.md).

Use this **packaged Global application**, not `pnpm start-hk4eos` or an old open
window:

`/Users/david/Library/Application Support/YAAGL Local Builds/fps-delayed-crash-20260914T031349Z/package/Yaagl OS.app`

It uses the **existing** profile:

`/Users/david/Library/Application Support/Yaagl OS FPS Review`

The window title changes to **Yaagl OS**; the profile directory and bundle ID do
not change. No Wine/profile/game data is inside the new app. The wrapper stages
public resources only when you open it and preserves existing saved settings.
Outer signing/notarization is absent; the matching ARM64 native is ad-hoc signed.
Intel helpers require Rosetta. The old signed xdelta helper's Intel liblzma
prerequisite is unresolved, so do not use legacy xdelta update/repair during this
checkpoint. Sophon resources are complete but were inspected statically only.

## Stop conditions

A crash, artifact mismatch, failed API/write/signature/admission, unresolved
lifetime, missing cleanup acknowledgement, privileged-operation error or failed
restoration stops testing. If the game still responds, capture live evidence and
quit it normally. Keep the launcher open for cleanup. Do not force quit/release,
kill Wine, delete retained evidence, issue protocol commands, change security
metadata or install the offline Wine candidate. Do not start a second instance.
A visible native startup-failure panel is a failure to investigate, not a pass;
its Quit button uses the normal cleanup guard.

Keep **Steam Patch ON, Launch Fix/block hosts OFF**, the same Global 7.0.0 game,
selected original Wine, DXMT 0.80.0, Timeout Fix and Metal HUD settings. Launch Fix
was OFF for the delayed failed request; its integration is now unit tested with
FPS off/on, but its historical real-game compatibility issue is not declared
fixed. Do not enable it or approve a privileged host operation in this checkpoint.
No Native Fullscreen or Game Mode changes. Existing provenance acceptance remains.

## 1. Verify the new package without opening it

Close an older launcher normally only if its cleanup is already confirmed. If
that is unresolved, collect its evidence and stop instead. Paste:

```sh
cd /Users/david/code/home/yaagl_vibecoding/yet-another-anime-game-launcher
export PATH="/Users/david/.npm/_npx/b620232375418b77/node_modules/.bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"
python3 - <<'PYCODE'
import hashlib, json, subprocess
from pathlib import Path
p = Path('/Users/david/Library/Application Support/YAAGL Local Builds/fps-delayed-crash-20260914T031349Z/package')
a = p / 'Yaagl OS.app'
r = a / 'Contents/Resources'
b = json.loads((r / 'manifests/build.json').read_text())
assert subprocess.check_output(['node','--version'], text=True).strip() == 'v16.20.2'
assert subprocess.check_output(['pnpm','--version'], text=True).strip() == '7.33.7'
assert not subprocess.check_output(['git','status','--porcelain'], text=True).strip(), 'Preserve changes and stop for review'
head = subprocess.check_output(['git','rev-parse','HEAD'], text=True).strip()
assert head == b['sourceCommit'], (head, b['sourceCommit'])
assert b['native']['version'] == '4.11.0-yaagl-owned2'
assert b['bridge']['sha256'] == '59ae7f9e1b753499386cfe5336c9f4a4d911c39c69ce3447712c4522ccbe7c95'
for entry in json.loads((p / 'bundle-manifest.json').read_text())['files']:
    f = a / entry['path']
    assert f.stat().st_size == entry['bytes'], str(f)
    assert hashlib.sha256(f.read_bytes()).hexdigest() == entry['sha256'], str(f)
wine = Path.home() / 'Library/Application Support/Yaagl OS FPS Review/wine/lib/wine/x86_64-unix/ntdll.so'
assert hashlib.sha256(wine.read_bytes()).hexdigest() == 'f26ade35f5b49e33b3780b6adc71f9eb9c831ea40222c1bae667ac14135d984b'
print('Verified source:', head)
print('Native:', b['native']['sha256'])
print('Bridge:', b['bridge']['sha256'])
print('Resources:', b['resourcesSha256'])
print('App:', a)
PYCODE
```

A mismatch stops the checkpoint. Do not rebuild/re-copy files to bypass it.

## 2. Launcher-only visual and normal-quit check

Start a screen recording before this command if convenient. It opens the exact
packaged UI with terminal capture; **do not press Launch in this stage**:

```sh
cd /Users/david/code/home/yaagl_vibecoding/yet-another-anime-game-launcher
export YAAGL_CHECKPOINT_CONSOLE="$(mktemp -d /tmp/yaagl-fps-console.XXXXXX)"
printf 'Keep this console directory: %s\n' "$YAAGL_CHECKPOINT_CONSOLE"
python3 - <<'PYCODE'
import os, time
from pathlib import Path
Path(os.environ['YAAGL_CHECKPOINT_CONSOLE'], 'started-ms').write_text(str(int(time.time()*1000)))
PYCODE
set -o pipefail
"/Users/david/Library/Application Support/YAAGL Local Builds/fps-delayed-crash-20260914T031349Z/package/Yaagl OS.app/Contents/MacOS/parameterized" 2>&1 | tee "$YAAGL_CHECKPOINT_CONSOLE/terminal.log"
cp "$HOME/Library/Application Support/Yaagl OS FPS Review/neutralinojs.log" "$YAAGL_CHECKPOINT_CONSOLE/launcher-final.log"
```

Require the first normal window to contain the initialized interface and have
exact title **Yaagl OS**, with no preliminary white “Starting Launcher…” window,
show/hide flash or second normal window. A brief hidden initialization period is
expected. If startup cannot complete, a native explanation must appear by the
90-second deadline; preserve its exact text and timing. An indefinitely Dock-only
process fails. Do not dismiss a cleanup/lifetime warning by forcing exit.

Check that settings are accessible and saved Launch Fix remains OFF. Close the
launcher normally. Require normal process exit and terminal command return.
The final log should contain `Bootstrap DOM ready; showing launcher once` once
for that startup; retries may precede it. Return the recording/timing, title,
full visible error if any, and printed console directory. **This is the immediate
manual checkpoint; gameplay stages below are conditional on its success.**

## 3. Enabled 60 startup and cleanup

Only after step 2 passes, repeat its launch/capture block to open a fresh instance.
Change only FPS unlocking to ON and target to **60**. Verify Steam Patch ON and
Launch Fix OFF. Record wall-clock time and press Launch **once**.

Reach login and keep it stable for at least 30 seconds. Require this request's
`.bridge.log` to show canonical Steam bootstrap, desktop readiness before game
creation, retained actual game PID, `worker start requested generation=1` with
`target=60`, `worker applying`, and successful readback/equal 60. Generation 0 or
login alone is not a worker pass. Compare-equal without writing is correct at 60.
New `worker heartbeat` records should advance read/equal counters; normal game
value resets can require writes, which must complete four bytes and read back.

Capture live evidence with step 5 before quitting, quit the game normally, wait
for step 6's cleanup, then close the launcher and capture final evidence. Do not
advance after any failure. No fresh disabled game control is required by the
current delayed-fault evidence; previous successful disabled results remain.

## 4. One controlled delayed-crash observation at 150

Only after enabled 60 and its cleanup pass, this optional diagnostic replay tests
whether the new observations establish the later operation/page state. **The
selected original Wine still has the known protection hazard; a successful replay
would not prove that hazard repaired.** Do not install/change Wine for this test.

Repeat the packaged launch/capture block. Change only target to **150**, matching
the delayed failed run, and launch once. Require generation at least 1, worker
applying, successful four-byte writes when needed and equal readbacks of 150.
Game DXMT maximum must remain 0. Enter a stationary, repeatable in-world scene
and observe for **six minutes from world entry**, recording exact start/exit times.
Keep the desktop unlocked. Record numerical HUD minimum/typical/maximum and a
screenshot/recording; sustained observed FPS above 60 is the performance gate.
A target label or memory write alone does not establish achieved frame rate.

Take a live capture early in-world to preserve request/journal/registry preimages,
and a final capture after normal exit or immediately after failure. Keep the full
recording through any crash. The useful new evidence is `worker heartbeat`
(read/write/equal/mapping counters), `memory failure probe` (API result, byte count,
error, retained HANDLE exit state and queried mapping), the last write/readback,
and the game's exact fault timestamp, accessed address, stack and module mapping.
These samples can miss a transient NOACCESS interval. Direct proof of that race
still requires fault-time protection/APC evidence or a separately authorized
controlled runtime comparison; this checkpoint does not silently enable enormous
additional Wine trace channels or change runtime libraries.

Stop at the first failure. Do not repeat it, try 61/additional targets, alter
other settings or turn Launch Fix on to compare. At six minutes, capture and quit
normally; require cleanup. Passing this duration records only this run's duration,
worker operation and achieved FPS, not an unlimited stability guarantee.

## 5. Preserve this run's live and final evidence

Use a second Terminal. Replace the first assignment with the exact printed
console directory from the current launch. This selects one new run by its
filename timestamp, preserves all its streams and the full launcher log, and
avoids repeatedly copying unrelated older multi-gigabyte game logs:

```sh
cd /Users/david/code/home/yaagl_vibecoding/yet-another-anime-game-launcher
export YAAGL_CHECKPOINT_CONSOLE='/tmp/yaagl-fps-console.REPLACE_WITH_PRINTED_SUFFIX'
YAAGL_RUN_LOG="$(python3 - <<'PYCODE'
import os, re
from pathlib import Path
start = int(Path(os.environ['YAAGL_CHECKPOINT_CONSOLE'], 'started-ms').read_text())
logs = Path.home() / 'Library/Application Support/Yaagl OS FPS Review/logs'
runs = {int(m.group(1)) for p in logs.glob('game_*.log*')
        if (m := re.fullmatch(r'game_(\d+)\.log(?:\.(?:wine|bridge|steam)\.log)?', p.name))
        and int(m.group(1)) >= start}
assert len(runs) == 1, f'Expected one new run; preserve console and launcher log and stop: {sorted(runs)}'
print(f'game_{runs.pop()}.log')
PYCODE
)" && python3 scripts/collect-hk4e-launch-evidence.py \
  --profile "$HOME/Library/Application Support/Yaagl OS FPS Review" \
  --run-log "$YAAGL_RUN_LOG" --console "$YAAGL_CHECKPOINT_CONSOLE"
```

Keep each printed evidence directory. Run it while stable before game exit and
again after cleanup/normal launcher exit. If there is no new game log, preserve
the console and full profile `neutralinojs.log`; do not select an older run as a
substitute. Full Wine logs can grow by gigabytes; if space becomes insufficient,
stop the test normally and report it without deleting evidence.

The collector reads sources and creates a new evidence directory. It sends no
process/protocol/cleanup commands. It records missing/changing files explicitly.
Preserve `.bridge.log`, `.wine.log`, `.steam.log`, ordinary game log if present,
terminal/DXMT output, crash reports/dumps and retained request/registry/journal
files. Missing write lines do not establish that no other component wrote memory.
Do not distribute unrelated credentials or private game/profile contents.

## 6. Required cleanup gates for each game stage

For the same request and game PID, require:

- Known normal game exit 0, workerDone 1, game job active 0, Steam job active 0,
  shimExited 1 and released 1. A crash code is a failed game run even if all
  subsequent restoration succeeds.
- Foreground Wine supervisor completion; first owned Wine wait; acknowledged
  registry restoration; second Wine wait; file-journal restoration and final
  `registry/file restoration and private resource cleanup completed`.
- No unresolved guard or lingering patch warning, and normal launcher close.
  Retain the live preimages and final capture so restoration can be independently
  compared. Logs alone cannot replace missing preimages for that comparison.

The primary worker/game failure must remain visible. A repeated retained worker
error should no longer appear falsely under “Earlier cleanup errors”; actual
cleanup errors must still be retained even after later successful restoration.
Launch Fix is OFF in this checkpoint, so no privileged-operation acknowledgement
is expected. If it unexpectedly runs or an elevation prompt appears, cancel the
prompt normally, collect evidence and stop.

Return each stage's console/evidence paths, exact times, login/worker result,
HUD measurements, full errors and cleanup result. Earlier operator successes and
the previous enabled-120 91.72–106.78 FPS observation remain separate from the
later packaged target-150 failure and this new unrun candidate. Enabled 61 remains
unaccepted. No stage here is executed automatically by the assistant.
