# HK4E running-status correction, 2026-10-03

Manual acceptance is pending the user's test of the installed correction.

## Diagnosis and scope

The initial checkout was implementation branch
`fix/hk4e-presentation-launch-prep-20261001`, HEAD
`f81c8b55b803c350a2eccf4391b64b640313b73f`; the installed app recorded executable
source `9fb0e1ddbfc37ca8b3fb3ced61ae91f0a30b9074`. The only pre-existing working-tree
item was untracked `preparation-trace.log`, preserved. No main, assessment or
prototype branch is part of this change.

The saved real-game log for request `mut5fnel-1` selects FPS disabled, Steam Patch,
native fullscreen and Game Mode enabled. The ordinary launch generator reserved
ownership (setting `Preparing launch`) and sent `GAME_RUNNING` only to the task
queue, before spawning Wine. It never supplied an attributed running/ended event
to ownership. The renderer deliberately gives held ownership priority over queue
progress; that leaves preparation visible for the entire game. The FPS path
already supplies attributed events. This is an observation/transition gap in the
ordinary path, not a Dock-host filename, focus or cache problem.

Ordinary launches now reuse the existing request-private bridge's exact game
handle and owned job observation, including the signed Steam route. Only a
validated response for the current token/sequence and launched game PID invokes
`running`; helper startup is not evidence. This path does not start the FPS worker,
perform FPS registry transactions, or change saved FPS preferences or ordinary
DXMT configuration. The direct route retains its protection-file preparation;
the bridge launches the game with the same platform arguments. Regional host
names, stable bundle ID, icons, fullscreen/Game Mode assets and routing are unchanged.

Ownership renders exactly `Game is running. DO NOT QUIT THE LAUNCHER`. A request's
status moves forward through preparation, running, cleanup and completion. Late
preparation/running callbacks cannot regress cleanup or completion; older request
callbacks cannot affect a new reservation. A terminal failure has an explicit
status transition independent of preparation callbacks. Ordinary cleanup waits
for attributed game/job exit and owned foreground execution, then Wine completion,
window/registry/file restoration and private-runtime disposal. Cancellation or a
failed launch acknowledgement cannot bypass game observation. Unknown protocol
responses retain ownership; cleanup failures retain the existing recovery gate.

## Checks before delivery

Pinned Node 16.20.2 / pnpm 7.33.7 source checks: TypeScript, ESLint, formatting and
the complete Vitest suite. Focused production-generator tests cover ordinary and
FPS routes, both Steam selections/regions/fullscreen settings, absence of an FPS
worker on the ordinary route, invalid-token observation, late callbacks,
cancellation and failed acknowledgement after game creation.

The native WebKit fixture renders the production launcher and task queue with
inert game gates in a separate temporary profile. It asserts visible text and
Launch-button state through two complete launches, delayed queue/owner callbacks,
old-request events and native focus changes. This is rendered UI evidence, not a
real-game test. Reproduce with:

```sh
npm exec --yes --package=node@16.20.2 --package=pnpm@7.33.7 --call \
  'pnpm exec vite build --config scripts/ui-fixture.config.ts && node scripts/test-launch-status-ui.cjs'
```

Native Wine fixtures, committed-source package verification, real-game validation,
installation and rollback identities are recorded below after delivery checks.
Private evidence is retained under `.tmp/launch-status-20261003`; no broad build
or evidence cleanup is part of this correction. Both the prior rollback and the
pre-change installed application must remain recoverable until manual acceptance.

## Delivered build and live evidence

Executable source: `30f813291b628f13265398da37370fafe26d39b7`.
Built with `YAAGL_BUILD_OUTPUT=build/launch-status-20261003 ./build-macos.sh`.
The package gate passed all 562 file identities, source/toolchain manifests,
regional Game Mode/routing/icon/signature/dependency checks and four xdelta
round trips. Source checks passed: 40 Vitest files, 2,204 tests, one optional
public-artifact test skipped; TypeScript/formatting passed and ESLint reported
zero errors (10 warnings). Both real Wine bridge suites passed (direct and Steam),
including exact attribution, no retargeting, exit-before-worker and guarded release.
The rendered native UI fixture passed both launches and stale/delayed-event checks.

On this Mac, with the user's unchanged FPS-disabled, Steam Patch, native fullscreen
and Game Mode settings, three bounded real-game sessions reached the signed-in
start screen:

| Application | Request | Game PID | Fresh private runtime |
| --- | --- | --- | --- |
| Built candidate | `mut6m7j5-1` | 25295 | `r2-jpDW7csq6T` |
| Installed, first launch | `mut6u61b-1` | 28006 | `r2-acT5PufsGP` |
| Installed, relaunch in the same launcher | `mut6yqr8-2` | 30064 | `r2-TvyTPifOCL` |

Screenshots and native accessibility headings confirm the exact running warning
in the real launcher, with the game visibly running. Candidate and installed-first
checks entered/left native fullscreen and switched focus back to the launcher;
the warning persisted. Game Mode showed On. Hover screenshots on all three runs
show `Genshin Impact` and its existing icon. Normal in-game exit confirmed code 0,
cleanup text while restoration remained pending, then blank idle and enabled
Launch/Settings controls. Bridge records show no FPS worker on these ordinary
runs. Every private runtime, game job and foreground execution completed cleanup.
The launcher then quit normally. Accessibility polling's `other` records during
Space transitions mean its window tree was unavailable; screenshots and fresh
headings on return establish the displayed status.

`/Applications/Yaagl OS.app` matches all 562 candidate files, including SHA-256,
mode and size, after the installed smoke checks. All 22 pre-existing `.storage`
files are byte-for-byte unchanged. No game, Wine, bridge, launcher, Sophon or aria2
process from this task remains. The pre-change application is recoverable at
`/Applications/Yaagl OS.rollback-before-status-20261003.app` (source
`9fb0e1ddbfc37ca8b3fb3ced61ae91f0a30b9074`). The earlier
`/Applications/Yaagl OS.rollback-20261003.app` is also preserved unchanged.
The new staging candidate and evidence remain; nothing was broadly deleted.

Private evidence: `.tmp/launch-status-20261003/delivery-verification.json`,
`installation.json`, `rendered-status-assertions.json`, source/native/package logs,
and `candidate-*`, `installed-1-*`, `installed-2-*` screenshots, accessibility
snapshots and request logs. These checks qualify delivery, not manual acceptance
or extended gameplay. Live testing kept FPS disabled as saved; enabled FPS paths
were checked through the production-generator and native Wine fixtures. The user
still needs to test playing, fullscreen transitions, normal cleanup and relaunch.
This follow-up documentation commit does not change the delivered executable source.
