# Optional next checkpoint: crash verification with the isolated R2 candidate

The autonomous R2 runs at 60, 120 and 150 completed without a recorded gameplay
crash, with a functioning worker, normal game exit and confirmed cleanup. The 150
run observed 600 seconds after world entry with natural gameplay transitions.
No further UI review is requested, and no test starts automatically. The lost
150 recording is documented; it is not a reason to require another run.

The optional instructions below are for ordinary target-150 gameplay if you
choose to extend crash verification. Finite successful runs support this
candidate but do not prove that every delayed crash is fixed. There are no
remaining launcher/game owners from the autonomous runs.

The agent has already removed obsolete YAAGL logs and backups and recovered
storage. No storage cleanup is assigned to you. Current app, selected candidate,
working installations, source history and shared game data remain preserved.
Older plaintext logs have verified lossless archives and deletion receipts.
See [the resumed results and limitations](docs/fps-r2-game-validation-20260914.md).

The original-runtime disabled control reached stable login. Autonomous R2
enabled 60 reached stable login with an applying worker and normal cleanup;
enabled 120 reached the world with successful writes/readbacks and nine HUD
samples of 116.85–118.33 FPS over 240 seconds. Both have timing/capture qualifications in the report. The 120 run has
complete fresh 29-path/two-value restoration evidence; the earlier 60 run has
28 fresh paths plus a separately labelled historical parent-metadata supplement.
Do not repeat disabled/60/120 automatically. A finite successful candidate run
does not prove that all delayed crashes are fixed.

## Use this exact app and isolated profile

App: `/Users/david/Library/Application Support/YAAGL Local Builds/fps-autonomous-validation-20260914T130005Z/package/Yaagl OS.app`

Package source: `4e396b1cc4f2e1bc4637b8a44a75752ee9a71c57`. Later report-only
commits may follow it; the package manifest must retain this exact source/hash
binding. The actual selected R2 Wine is `profiles/candidate/wine` below.

These instructions invoke the actual packaged native executable in the prepared
isolated `profiles/candidate` profile. Do not double-click the app wrapper, run
`pnpm start`, use the working profile, install/replace Wine, run historical
deployment scripts, repair/update the game or change security metadata. The old
baseline and unselected runtime copies were intentionally deleted.

Keep **Steam Patch ON, Launch Fix/block hosts OFF, Timeout Fix ON, Metal HUD ON,
DXMT 0.80.0**, with FPS unlocking ON and target **150**. Retain other settings.
Retain the existing graphics/VSync settings. No host-blocking
or privileged network commands, Native Fullscreen or Game Mode changes are part
of this checkpoint. Existing provenance acceptance remains recorded. Working
installation activation is a separate decision.

The app requires macOS 14+. Its ARM64 native executable is ad-hoc signed; the
outer app is unsigned/not notarized. Intel helpers require Rosetta. Complete
Sophon resources and actual UI health were checked. Legacy xdelta lacks its Intel
liblzma prerequisite; do not use game update/repair to bypass a failed test. No
Wine, profile or game data is inside the app bundle.

## 1. Verify, then open only this launcher

Use an unlocked desktop. If any prior launcher shows an unresolved lifetime or
cleanup guard, stop and preserve its evidence. Do not force release, kill Wine,
delete request files or open another launcher/game.

Paste in Terminal:

```sh
cd /Users/david/code/home/yaagl_vibecoding/yet-another-anime-game-launcher
export PATH="/Users/david/.npm/_npx/b620232375418b77/node_modules/.bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"
export YAAGL_TEST_ROOT='/Users/david/Library/Application Support/YAAGL Local Builds/fps-autonomous-validation-20260914T130005Z'
export YAAGL_TEST_PROFILE="$YAAGL_TEST_ROOT/profiles/candidate"
export YAAGL_TEST_APP="$YAAGL_TEST_ROOT/package/Yaagl OS.app"
python3 - <<'CHECK'
import hashlib,json,os,shutil,stat,subprocess
from pathlib import Path
e=Path(os.environ['YAAGL_TEST_ROOT']); p=Path(os.environ['YAAGL_TEST_PROFILE']); a=Path(os.environ['YAAGL_TEST_APP'])
assert subprocess.check_output(['node','--version'],text=True).strip()=='v16.20.2'
assert subprocess.check_output(['pnpm','--version'],text=True).strip()=='7.33.7'
assert shutil.disk_usage(e).free>=30_000_000_000, 'Evidence storage guard: stop and return this result; do not delete files yourself'
b=json.loads((a/'Contents/Resources/manifests/build.json').read_text())
assert b['sourceCommit']=='4e396b1cc4f2e1bc4637b8a44a75752ee9a71c57'
m=json.loads((e/'package/bundle-manifest.json').read_text())
assert m['sourceCommit']==b['sourceCommit'] and len(m['files'])==511
assert {str(f.relative_to(a)) for f in a.rglob('*') if f.is_file()}=={x['path'] for x in m['files']}
for entry in m['files']:
 f=a/entry['path']; assert f.stat().st_size==entry['bytes'],str(f)
 assert oct(stat.S_IMODE(f.stat().st_mode))==entry['mode'],str(f)
 assert hashlib.sha256(f.read_bytes()).hexdigest()==entry['sha256'],str(f)
assert hashlib.sha256((p/'wine/lib/wine/x86_64-unix/ntdll.so').read_bytes()).hexdigest()=='eef64f611ae9033261a70f46ec0be38d58823717f14e80331946c6d0cd3c85f7'
print('Verified package and selected R2 runtime. No game has been started.')
CHECK
```

Stop on any error or artifact mismatch. If verification passes and no unresolved
owner/guard exists, run the next block. It opens the UI and leaves this terminal
available; the helper rejects another active launcher/Wine/game process.

```sh
export YAAGL_TEST_RUN="$(mktemp -d "$YAAGL_TEST_ROOT/runs/manual-r2-enabled150.XXXXXX")"
printf 'RUN=%s\n' "$YAAGL_TEST_RUN"
python3 "$YAAGL_TEST_ROOT/launch-package.py" --app "$YAAGL_TEST_APP" --profile "$YAAGL_TEST_PROFILE" --output "$YAAGL_TEST_RUN/launcher" > "$YAAGL_TEST_RUN/launch-invocation.log" 2>&1 &
export YAAGL_LAUNCH_JOB=$!
```

Keep the printed RUN path. Verify only the required gameplay settings above.
Set FPS unlocking ON/150 if needed, allow settings to persist, then close the
settings dialog. **Do not press Launch yet.** If the launcher cannot become
ready, preserve its console and stop.

## 2. Prepare fresh evidence before Launch

In the same terminal, after the normal UI and saved settings are ready:

```sh
python3 "$YAAGL_TEST_ROOT/tools/run-preimages.py" capture --profile "$YAAGL_TEST_PROFILE" --app "$YAAGL_TEST_APP" --output "$YAAGL_TEST_RUN/preimages" --enabled true --target 150
```

Require `captureVerified=true`, **29 paths and two registry values**. Any setting
or artifact mismatch stops here; do not edit captured manifests. Then start the
read-only request watcher:

```sh
python3 "$YAAGL_TEST_ROOT/tools/watch-request-evidence.py" --profile "$YAAGL_TEST_PROFILE" --output "$YAAGL_TEST_RUN/request-snapshots" --seconds 1800 > "$YAAGL_TEST_RUN/watcher-console.log" 2>&1 &
export YAAGL_WATCH_JOB=$!
```

Wait for its READY file to exist, then run:

```sh
cat "$YAAGL_TEST_RUN/request-snapshots/READY.json"
python3 "$YAAGL_TEST_ROOT/tools/run-preimages.py" check --preimages "$YAAGL_TEST_RUN/preimages" --output "$YAAGL_TEST_RUN/prelaunch-check.json"
date -u '+%Y-%m-%dT%H:%M:%SZ' | tee "$YAAGL_TEST_RUN/launch-intent-utc.txt"
```

Require a READY timestamp from this run and all prelaunch comparisons true.
Press **Launch once**. If the Launch button is missing or disabled,
preserve the result; do not create the game independently.

## 3. Verify worker and sustained gameplay

Reach login, then enter the world. Require this request's retained game PID,
worker generation at least 1, workerState 2/applying and no primary/worker error.
The bridge log must record successful reads at target 150 and successful
four-byte writes when the game value differs, followed by
`value=150 target=150 action=equal`. Generation 0, a displayed target or login
alone is not a worker pass.

Record the UTC world-entry time and play normally, including movement and a
normal menu/world transition. A session extending beyond the earlier estimated
five-minute failure is useful; about ten minutes is a bounded follow-up. Note
the numerical HUD FPS if convenient. Keep graphics variables unchanged; let the
worker respond to natural FPS resets.

Begin normal quit after this observation. If the world has not loaded within
three minutes, or this attempt reaches fifteen minutes from Launch, capture
evidence and quit normally; report the stage as incomplete. These are
observation/storage bounds, not changes to game startup or worker timing.

Record the new `game_<timestamp>.log` basename and request token from this run's
launcher log/status. In the same terminal set the exact name, replacing the
placeholder, and capture evidence while the game is still alive:

```sh
export YAAGL_TEST_LOG='game_REPLACE_WITH_THIS_RUN_TIMESTAMP.log'
python3 scripts/collect-hk4e-launch-evidence.py --profile "$YAAGL_TEST_PROFILE" --run-log "$YAAGL_TEST_LOG" --clone-files --output "$YAAGL_TEST_RUN/live-capture" --console "$YAAGL_TEST_RUN/launcher/console"
```

Any crash, failed API/write/signature/admission, stale or missing watcher,
unknown lifetime, artifact mismatch, low-storage guard or missing cleanup
acknowledgement ends this checkpoint. Capture evidence immediately. If the game
is responsive, quit normally; otherwise retain the guarded launcher. Do not
retry or advance to another target. A later worker error must be correlated with
the first game exception rather than assumed to cause it.

## 4. Quit normally and verify restoration

After the observation, quit using the normal game UI and confirm any quit dialog.
Keep the launcher open until this exact request shows known game exit 0,
workerDone 1, active 0, steamActive 0, shimExited 1 and released 1; foreground
Wine supervisor completion; both request-owned Wine waits; registry restoration
acknowledgement; and `registry/file restoration and private resource cleanup
completed`. A vanished process or command return does not replace these gates.

After confirmed cleanup, close the launcher normally and run:

```sh
wait "$YAAGL_LAUNCH_JOB"
cat "$YAAGL_TEST_RUN/launcher/EXIT.json"
python3 scripts/collect-hk4e-launch-evidence.py --profile "$YAAGL_TEST_PROFILE" --run-log "$YAAGL_TEST_LOG" --clone-files --output "$YAAGL_TEST_RUN/final-capture" --console "$YAAGL_TEST_RUN/launcher/console"
python3 "$YAAGL_TEST_ROOT/tools/run-preimages.py" compare --preimages "$YAAGL_TEST_RUN/preimages" --output "$YAAGL_TEST_RUN/restoration-independent.json"
python3 "$YAAGL_TEST_ROOT/tools/audit-journal-coverage.py" --preimages "$YAAGL_TEST_RUN/preimages" --snapshots "$YAAGL_TEST_RUN/request-snapshots" --enabled true --output "$YAAGL_TEST_RUN/journal-coverage.json"
python3 - <<'DXMT'
import hashlib,json,os
from pathlib import Path
p=Path(os.environ['YAAGL_TEST_PROFILE']); r=Path(os.environ['YAAGL_TEST_RUN'])
records=[]
for name in ['GenshinImpact_dxgi.log','GenshinImpact_d3d11.log']:
 f=p/name
 if not f.exists(): records.append({'source':str(f),'missing':True}); continue
 data=f.read_bytes(); out=r/('final-'+name)
 with out.open('xb') as stream: stream.write(data)
 records.append({'source':str(f),'copy':str(out),'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()})
with (r/'final-dxmt.json').open('x') as stream: json.dump(records,stream,indent=2)
DXMT
```

Require native exit 0, all 29 path states and both typed registry values matching,
all journal destinations captured before launch, matching journal preimages and
both native registry snapshots. These independent comparisons do not substitute
for cleanup acknowledgements. The collector does not include profile-root DXMT
logs; the final block preserves them separately and reports missing files.

Only after the final capture/comparisons, stop the evidence watcher by creating
its **evidence-only** stop marker and retaining its exit status:

```sh
touch "$YAAGL_TEST_RUN/request-snapshots/STOP-WATCHING"
wait "$YAAGL_WATCH_JOB"
```

This marker is not a bridge protocol command. Do not delete request, journal or
registry sources. Keep full launcher/game/Wine/bridge/Steam logs, live request
versions, crash reports, DXMT output and final comparisons. Missing or unstable
live files remain explicit; they are not substituted for stable final captures.

Return the RUN path, login/world-entry/exit times, numerical FPS range, worker
read/write results, full visible error if any, and cleanup/restoration results.
Do not install the candidate into the working profile or run another target
until these operator results are reviewed.
