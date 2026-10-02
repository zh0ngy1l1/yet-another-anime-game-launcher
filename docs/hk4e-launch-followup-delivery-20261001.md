# HK4E launch follow-up delivery — 2026-10-01

The existing feature branch continues from `3e6844d`; main remains
`08928a6413d38ae0345a348eae17b94428776527`. The user's acceptance and recovered
real trace are committed separately from the complete-verification optimization:

- `631c198`: [user acceptance and real-launch analysis](hk4e-real-launch-followup-20261001.md).
- `5f1cff960aa82e2538f08caf4022299bfb92efc5`: [complete hashing acceleration,
  comparisons and regression coverage](hk4e-complete-hashing-20261001.md).
- This delivery record follows the candidate build; it does not change executable
  source or the candidate's embedded identity.

## Supported result

The preserved manual run measures **47.841 s preparation**, followed by
**0.973 s game-creation acknowledgement**. Its four nested inventories total
**22.508 s**. The matching request records successful game exit, restored state
and removed private resources. Visible readiness and click-to-play duration are
unmeasured. The user reports acceptable launch time and correct name/icon on
their selected Global, FPS 150, fullscreen, Game Mode and Steam route; this is
not acceptance of every configuration or presentation surface.

Three alternating disposable baseline/candidate recipe comparisons measure
**22.682 / 21.041 / 21.068 s** versus **15.902 / 16.113 / 15.994 s**.
The median improves **21.068 → 15.994 s**, saving **5.073 s / 24.1%** with complete
equivalent receipts. This is an isolated recipe result, not measured real-launch
savings. Every inventory, byte hash, metadata/containment check, source/copy
comparison, signature gate, publication and cleanup boundary is retained.
System OpenSSL handles only large already-open files; no new packaged helper,
parallel pool or persistent cache is introduced.

## Candidate and verification

The new separately staged package is
**`build/launch-hashing-20261001/Yaagl OS.app`**, built from clean committed source
`5f1cff960aa82e2538f08caf4022299bfb92efc5` with the documented pinned toolchain.
The already accepted `build/launch-polish-20261001/Yaagl OS.app` remains available
with source `4dfd3ad174907dea13f3f9a826d94963ab0fc481`.
`/Applications/Yaagl OS.app` is retained without installation or replacement.

Validation passed: TypeScript, lint and formatting; **110 focused source tests**;
**22 hashing-contract checks**; **13 R2 preparation cases**; and **17 regional
fullscreen/Game Mode composition cases**. The nine existing lint warnings remain.
An initial cancellation-test fixture used a nonexistent deferred rejection method;
the fixture was corrected, then focused tests and source checks passed. No product
change was needed for that test correction.

Complete package verification passed **562 files and four xdelta round trips**,
including bundle/ASAR identity, embedded changed recipe, signatures, dependencies,
regional names/icons and native assets. Existing compiler deprecation/chunk-size
warnings remain. The native launcher executable retains the accepted package's
hash; the executable change is the frontend's embedded preparation recipe.
The outer app remains unsigned/unnotarized as before.

The initial packaged launcher check stopped at a locked macOS desktop before any
game input. The launcher rendered, then quit normally with its sidecars. After
the user unlocked the desktop, the remaining real-game validation completed as
described below. No new macOS permissions or authentication workaround was needed.

No cursor, Retina, resolution or geometry behavior changes are included. The
previous [auxiliary-window displacement observation](hk4e-cursor-investigation.md)
remains a known limitation, not a passing case, and was not investigated further.
The running warning remains `Game is running (DO NOT CLOSE THE LAUNCHER)`.

## Completed packaged real-game validation

The same verified `5f1cff9` package was opened through its normal wrapper after
confirming the desktop was unlocked and no launcher/game was active. Current
logs, settings and manifests were preserved first. The shared **Yaagl OS R2**
profile loaded the candidate, and one normal **Launch Game** action used the same
Global/Wine 11/FPS 150/native fullscreen/Game Mode/Steam configuration as the
accepted manual run. Retina, HDR, ReShade and Launch Fix remained disabled.

The game reached its signed-in start screen. Its running application name was
**Genshin Impact**, with the stable game bundle identifier and the expected
publisher icon; the running host's icon bytes matched the admitted Global asset.
Using the ordinary green window control entered native fullscreen. The HUD
showed **Game Mode On** and approximately **150 FPS** at the start screen.
The launcher displayed its required running warning. This validates the packaged
preparation path and these observed presentation/lifecycle behaviors; this run
stayed at the start screen and does not extend gameplay or configuration coverage.

| Nonoverlapping preparation component | Accepted manual run (s) | New candidate (s) |
| --- | ---: | ---: |
| Private runtime | 24.448 | 17.434 |
| FPS registry snapshot | 6.081 | 6.499 |
| Setup | 10.772 | 10.809 |
| Wine/Steam bridge readiness | 5.528 | 6.025 |
| Other preparation | 1.012 | 1.043 |
| **Preparation total** | **47.841** | **41.810** |

Inside private-runtime preparation, the recipe measures **24.418 → 17.414 s**,
including four complete inventories totaling **22.508 → 15.497 s**. Those are
nested intervals, not additional time. Native phases retain their own monotonic
origin; forwarded JavaScript receipt timestamps are not phase starts. Creation
acknowledgement measures **0.973 → 0.971 s**; trace-origin-to-acknowledgement is
**48.815 → 42.782 s**. The 6.031 s lower preparation time is a comparison of two
individual real runs, with uncontrolled cache/load differences. The three paired
recipe measurements remain the controlled comparison. Screenshots establish
visible start-screen rendering, not the earliest readiness or click-to-play time.
Before the trace, bootstrap-to-DOM took 8.745 s in log time, and the following
35.293 s included deliberate operator inspection. Automation click dispatch to
the first timing-log receipt was about 0.123 s, including dispatch/logging rather
than isolating queue latency. These intervals are outside measured preparation.

The in-game power control and its **OK** exit confirmation closed the game
normally with exit code zero. All 21 JavaScript spans and nine native phases
completed successfully. Exit-status receipt to completed cleanup took **14.410 s**
in wall-clock log time, separate from preparation and visible readiness.
The launcher remained open until restoration and private-resource
cleanup completed, then returned to **Launch Game** without a recovery warning.
Read-only checks confirmed the actual request's temporary bridge, private runtime
and window-state directories were absent. All 22 preserved settings retained
identical hashes. The diagnostic launcher then
quit normally and both owned sidecars exited; pre-existing unrelated Wine device
processes were left alone. No executable source changed during this validation,
so the existing committed-source package was reused without rebuilding.

## Local evidence

Private logs, screenshots, settings and paths stay under the ignored
`.tmp/launch-followup-20261001/` directory. `manual-run/` and
`manual-trace-analysis.json` preserve the accepted launch; `hash-options/` contains
the paired measurements and prototypes; `validation-summary.json` records checks;
`build.log` and `live-run/` record the new package, rendered launcher and lock
boundary. `preserved-bundles-verified.json` confirms all 554 installed files and
562 accepted-candidate files matched their preserved inventories. The unrelated
empty `preparation-trace.log` is retained untouched and is not committed.
`live-unlocked/` contains the completed run's before/after logs and settings,
request timings, presentation screenshots, process checks and preservation hashes;
`live-trace-analysis.json` there correlates the complete request and cleanup.
All 554 installed files and both 562-file staged candidates still match their
original inventories after this run. Raw account and machine data stays local.

Only the existing feature branch is delivered to the fork. There is no main
movement, upstream integration, history rewrite, force push, PR or release.
