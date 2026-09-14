# Next checkpoint: isolated R2 enabled60 after storage is available

Work stopped at the user's request to wrap up. **No test runs automatically.**
The final packaged launcher passed the observed presentation, hidden-readiness,
settings-persistence and normal-quit checks. The original-Wine disabled control
reached stable login at60 FPS, exited through the normal game UI, and has both
cleanup acknowledgements and independently matching28 file states/two typed
registry values. Its shutdown nested-exception trace is retained; the disabled
route did not directly capture the Windows game exit code.

R2 enabled60 was prepared but **not launched**: the automation found no unique
Launch button; there was no new game log or Wine/game process, and the user
requested wrap-up before retry. R2 enabled120/150 remain unrun. This package is
**not accepted as a delayed-crash fix**. See the full
[results and identities](docs/fps-autonomous-validation-20260914.md).

The next action is to make **at least30GB free** on this volume, or provide an
external evidence location with that capacity. Full Wine tracing grew around
21MB/s. Preserve existing YAAGL evidence, profiles, packages and game files.
External storage needs separately checked evidence destinations; the commands
below use the existing volume. Do not repeat the disabled run just because the
experiment was interrupted.

## Exact build and settings

App: `/Users/david/Library/Application Support/YAAGL Local Builds/fps-autonomous-validation-20260914T130005Z/package/Yaagl OS.app`

Package source: `4e396b1cc4f2e1bc4637b8a44a75752ee9a71c57`; later report-only commits do not change this binding.

Use the actual packaged native through the invocation below and the prepared
`profiles/candidate` profile. Do not double-click the wrapper, use the working
profile, run pnpm start, install Wine over another copy, run historical scripts,
update/repair the game or change security metadata. The exact fixture-tested Wine
is `profiles/candidate/wine`, with ntdll SHA-256
`eef64f611ae9033261a70f46ec0be38d58823717f14e80331946c6d0cd3c85f7`.
The earlier `runtime-candidate/wine` is a development-derived comparison copy.
Neither runtime has passed real-game candidate testing.

Keep **Steam Patch ON, Launch Fix/block hosts OFF, Timeout Fix ON, Metal HUD ON**,
DXMT0.80.0 and the same game/settings. No privileged host/network operations,
Native Fullscreen or Game Mode changes. Existing provenance authorization remains.

macOS14+; ARM64 native/ad-hoc signed; outer app unsigned/not notarized; Intel
helpers need Rosetta. Complete Sophon resources and actual UI health passed.
Legacy xdelta still lacks its Intel liblzma prerequisite. No Wine/profile/game
data is bundled; rebuilding the app does not install R2.

## One controlled enabled60 test

Use an unlocked desktop. In Terminal, verify the package and create fresh evidence:

```sh
cd /Users/david/code/home/yaagl_vibecoding/yet-another-anime-game-launcher
export PATH="/Users/david/.npm/_npx/b620232375418b77/node_modules/.bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"
export YAAGL_TEST_ROOT='/Users/david/Library/Application Support/YAAGL Local Builds/fps-autonomous-validation-20260914T130005Z'
export YAAGL_TEST_PROFILE="$YAAGL_TEST_ROOT/profiles/candidate"
export YAAGL_TEST_APP="$YAAGL_TEST_ROOT/package/Yaagl OS.app"
python3 - <<'CHECK'
import hashlib,json,os,shutil,subprocess
from pathlib import Path
e=Path(os.environ['YAAGL_TEST_ROOT']); p=Path(os.environ['YAAGL_TEST_PROFILE']); a=Path(os.environ['YAAGL_TEST_APP'])
assert subprocess.check_output(['node','--version'],text=True).strip()=='v16.20.2'
assert subprocess.check_output(['pnpm','--version'],text=True).strip()=='7.33.7'
assert shutil.disk_usage(e).free>=30_000_000_000, 'Insufficient evidence storage; stop'
b=json.loads((a/'Contents/Resources/manifests/build.json').read_text())
assert b['sourceCommit']=='4e396b1cc4f2e1bc4637b8a44a75752ee9a71c57'
for entry in json.loads((e/'package/bundle-manifest.json').read_text())['files']:
 f=a/entry['path']; assert f.stat().st_size==entry['bytes']
 assert hashlib.sha256(f.read_bytes()).hexdigest()==entry['sha256'],str(f)
assert hashlib.sha256((p/'wine/lib/wine/x86_64-unix/ntdll.so').read_bytes()).hexdigest()=='eef64f611ae9033261a70f46ec0be38d58823717f14e80331946c6d0cd3c85f7'
print('Verified package/runtime; ensure no unresolved launcher/game activity before proceeding.')
CHECK
```

On any mismatch, stop. If verified and no other launcher/game or unresolved guard
exists, paste this separate block. Keep the printed RUN path:

```sh
export YAAGL_TEST_RUN="$(mktemp -d "$YAAGL_TEST_ROOT/runs/manual-r2-enabled60.XXXXXX")"
printf 'RUN=%s\n' "$YAAGL_TEST_RUN"
python3 "$YAAGL_TEST_ROOT/tools/run-preimages.py" capture --profile "$YAAGL_TEST_PROFILE" --app "$YAAGL_TEST_APP" --output "$YAAGL_TEST_RUN/preimages" --enabled true --target 60
```

Require captureVerified=true,28files,two registry values. Saved-setting mismatch
stops here; do not modify capture files to bypass it. Then:

```sh
python3 "$YAAGL_TEST_ROOT/tools/watch-request-evidence.py" --profile "$YAAGL_TEST_PROFILE" --output "$YAAGL_TEST_RUN/request-snapshots" --seconds 900 &
python3 "$YAAGL_TEST_ROOT/launch-package.py" --app "$YAAGL_TEST_APP" --profile "$YAAGL_TEST_PROFILE" --output "$YAAGL_TEST_RUN/launcher"
```

Before pressing Launch, in a second terminal set the same ROOT/PROFILE/RUN values
and verify capture readiness again:

```sh
cat "$YAAGL_TEST_RUN/request-snapshots/READY.json"
python3 "$YAAGL_TEST_ROOT/tools/run-preimages.py" check --preimages "$YAAGL_TEST_RUN/preimages" --output "$YAAGL_TEST_RUN/prelaunch-check.json"
```

Require current watcher READY and all comparisons true. Visually check unlocking
ON,target60 and the required options above. Start a recording, note UTC time,
and press **Launch once**. Missing/unavailable Launch is evidence to return;
do not start Wine/game independently. Keep this startup check within three minutes.

At stable login observe30seconds. Require the same request/game identity,
worker generation>=1, workerState2/applying, no primary/worker error and successful
reads of60/target60/action=equal. Writes are only expected when the value differs.
Generation0 or login alone is not a worker pass. Record numerical HUD FPS.

Before normal quit, capture full live evidence (replace the placeholder with the
exact new filename from this run's launcher log):

```sh
python3 scripts/collect-hk4e-launch-evidence.py --profile "$YAAGL_TEST_PROFILE" --run-log 'game_<timestamp>.log' --clone-files --output "$YAAGL_TEST_RUN/live-capture" --console "$YAAGL_TEST_RUN/launcher/console"
```

Quit through the game's normal UI. Keep the launcher open until the exact request
records known game exit, workerDone1, active0,steamActive0,shimExited1,released1;
foreground supervisor completion; both request-owned Wine waits; registry
restoration acknowledgement; and registry/file/private-resource cleanup completed.
A crash, failed API/write/signature/admission, unknown lifetime, missing evidence,
low disk space or missing cleanup acknowledgement stops further testing.
Do not force quit/release, kill Wine, issue protocol commands or delete journals.

After confirmed cleanup, close the launcher normally, then:

```sh
python3 scripts/collect-hk4e-launch-evidence.py --profile "$YAAGL_TEST_PROFILE" --run-log 'game_<timestamp>.log' --clone-files --output "$YAAGL_TEST_RUN/final-capture" --console "$YAAGL_TEST_RUN/launcher/console"
python3 "$YAAGL_TEST_ROOT/tools/run-preimages.py" compare --preimages "$YAAGL_TEST_RUN/preimages" --output "$YAAGL_TEST_RUN/restoration-independent.json"
python3 "$YAAGL_TEST_ROOT/tools/audit-journal-coverage.py" --preimages "$YAAGL_TEST_RUN/preimages" --snapshots "$YAAGL_TEST_RUN/request-snapshots" --enabled true --output "$YAAGL_TEST_RUN/journal-coverage.json"
```

Retain full launcher/game/Wine/bridge/Steam logs, transitions, journals/registry
snapshots, crash reports, recording and the profile-root DXMT files
`GenshinImpact_dxgi.log`/`GenshinImpact_d3d11.log` (not included by this collector).
Live unstable clones are not final stable captures. Cleanup acknowledgement and
independent restoration equality are separate gates. Primary failure is not
reclassified as failed restoration merely because it remains in the report.

Return the RUN path/results before advancing. The remaining finite plan is120
for three minutes in-world, then150 for ten minutes with normal gameplay
transitions. Each requires fresh preimages/watchers/full logs/video, preceding
worker/cleanup/restoration success, observed FPS sustained above60, successful
writes/equal readbacks when natural resets occur, and recorded graphics/VSync
settings. Do not manufacture resets or change other variables.120 cannot
substitute for150; no new original150 retry or additional61 test is planned.
