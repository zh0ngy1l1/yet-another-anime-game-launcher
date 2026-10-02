# Native fullscreen upstream preparation — 2026-10-01

This is an assessment and a concrete source extraction, not an upstream
submission. The user personally tested the optimized candidate and reports
that the game works **exactly as intended**. That acceptance is recorded without
turning it into a claim about this smaller prototype. Performance tuning stops;
cursor, Retina and resolution policy remain unchanged.

The accepted checkout remains on
`fix/hk4e-presentation-launch-prep-20261001` at
`86d6c80624413f895806afcdd8ff7f93b059d759`. The accepted application is
`build/launch-hashing-20261001/Yaagl OS.app`; its bundle manifest confirms
executable source `5f1cff960aa82e2538f08caf4022299bfb92efc5`.
`preparation-trace.log` was already untracked. Neither that file nor the
accepted implementation/application is part of these preparation changes.

Two sibling launcher branches start directly from freshly fetched upstream
`fc56d843461a313fdc5c19af2a2a47eaf8f2f6ac`:

- `prep/fullscreen-assessment-20261001`: this assessment and handoff.
- `prep/native-fullscreen-prototype-20261001`: source patch, source/build recipe,
  isolated fixtures and reproducible evidence. It enables no launcher feature.

Prototype wrapper head: `4bfcc9dd1a89590cdcdc0e138677060cdd49b933`,
[linkable source and fixtures](https://github.com/zh0ngy1l1/yet-another-anime-game-launcher/tree/4bfcc9dd1a89590cdcdc0e138677060cdd49b933/native/wine-fullscreen).
Its wrapper is 18 new files / 1,972 lines including license, patch text, recipes,
documentation and fixtures; the actual Wine source change is six files / +93/-7.
No native binaries are committed or published.

The native source base is Wine 11.0
`db11d0fe6a169c457e23d007e20404643d067aa8` after the complete matching
`riverfog7/macports-wine` overlay
`0d029255bce8f2f4ac47a1984b59ba82e09d9829`. The verified prepared source tree is
`763e3aa9df162f403f5ef8dcff995c5db58fc044`. The native diff is against that
source tree, not the launcher's Git tree. The launcher fork hosts the patch
for review because creating another remote fork is outside this stage.

Read [upstream expectations](upstream-expectations.md) for published guidance,
source ownership, build/CI and overlapping PR #749; the [dependency audit](dependency-audit.md)
for exact symbols, registry scope and lifecycle gaps; and the
[distribution/PR sequence](launcher-and-game-mode-sequence.md) for A versus B,
the minimum launcher integration and later Game Mode work.

The recommended destination is a maintained opt-in Wine/overlay patch and a
qualified runtime release, followed by a small launcher transaction/settings
change. No unpublished runtime is treated as available. Runtime-shipped
fullscreen removes private runtime copying and driver sidecars; it does not
remove temporary registry rollback and interrupted-session recovery. The current
Game Mode request/host layout needs a separate shared-runtime design.

The Wine patch walkthrough and exact rebuild commands are in the prototype's
`native/wine-fullscreen/README.md`; start with the
[plain-language walkthrough](patch-walkthrough.md) before reviewing its source.
The [validation report](native-validation.md)
separates observed results from untested coverage and submission blockers.
The [maintainer proposal](maintainer-proposal-unsent.md) is prepared but unsent.

These materials and code were prepared with AI assistance, including machine
source reviews. No maintainer review or independent human code review is claimed.
Before personally submitting, explain the option/eligibility boundary, saved
frame and callback lifetime, registry rollback and runtime ownership in your own
words, and have the unresolved native behavior reviewed. Passing builds and
fixtures alone cannot establish that responsibility.
