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

The new candidate was opened through its normal wrapper after confirming no game
or launcher was active. It loaded the shared **Yaagl OS R2** profile, whose build
manifest then matched `5f1cff9`, and rendered the expected **Launch Game** control.
The manual run's logs/settings/manifests had already been preserved. No game
launch was started: macOS reported `CGSSessionScreenIsLocked=true` with
`loginwindow` foreground. Reading the rendered launcher window was possible,
but interacting with the locked desktop requires the user's password or Touch ID.
No authentication bypass or synthetic input through the lock screen was attempted.
The user was asked to unlock the Mac; packaged real-game validation remains
uncompleted at this authentication boundary. No new permissions were enabled.
The diagnostic launcher then quit normally and both owned sidecars exited.
Preserved settings and the private runtime/window-state directory inventories
remained unchanged; no game input, update, repair or settings experiment occurred.

No cursor, Retina, resolution or geometry behavior changes are included. The
previous [auxiliary-window displacement observation](hk4e-cursor-investigation.md)
remains a known limitation, not a passing case, and was not investigated further.
The running warning remains `Game is running (DO NOT CLOSE THE LAUNCHER)`.

## Local evidence

Private logs, screenshots, settings and paths stay under the ignored
`.tmp/launch-followup-20261001/` directory. `manual-run/` and
`manual-trace-analysis.json` preserve the accepted launch; `hash-options/` contains
the paired measurements and prototypes; `validation-summary.json` records checks;
`build.log` and `live-run/` record the new package, rendered launcher and lock
boundary. `preserved-bundles-verified.json` confirms all 554 installed files and
562 accepted-candidate files matched their preserved inventories. The unrelated
empty `preparation-trace.log` is retained untouched and is not committed.

Only the existing feature branch is delivered to the fork. There is no main
movement, upstream integration, history rewrite, force push, PR or release.
