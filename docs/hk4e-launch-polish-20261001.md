# HK4E launch polish delivery — 2026-10-01

> Later 2026-10-01 follow-up: the user accepted this candidate after real
> gameplay on their selected route, reporting correct name/icon and acceptable
> launch time. Its existing logs supplied a complete preparation/cleanup trace.
> See [the acceptance and real-launch analysis](hk4e-real-launch-followup-20261001.md).
> The first-stage account below is retained as historical context.

The subsequent [follow-up delivery](hk4e-launch-followup-delivery-20261001.md)
records the separately staged hashing candidate, measured savings and validation
boundaries while retaining this accepted package.

This first stage corrects the running Game Mode host's presentation and supplies
measured preparation evidence for selecting the next optimization. No real game
was launched, no performance shortcut/cache was implemented, and the working
installed application was retained. The user reports many successful gameplay
runs with the previous installed `f00f01c` candidate; this is user-reported
evidence for that candidate, not gameplay acceptance of this delivery.

## Source and review boundaries

Clean local and fetched fork `main` both started at
`08928a6413d38ae0345a348eae17b94428776527`. Integrated/fetched upstream remained
`fc56d843461a313fdc5c19af2a2a47eaf8f2f6ac`. There was no pending Git operation
or unrelated working change. Existing detached worktrees were preserved.

Feature branch: `fix/hk4e-presentation-launch-prep-20261001`.

- `53bc0ae`: regional game-host names, publisher icon, rebuilt signed assets,
  manifest/package checks and presentation fixtures.
- `722f338`: cursor evidence and manual capture procedure; documentation only.
- `e80e62e`: request/phase diagnostics, production recipe measurement harness,
  regression checks and preparation investigation.
- `4dfd3ad174907dea13f3f9a826d94963ab0fc481`: isolated production Wine helper
  measurement harness; candidate build source.
- The delivery-record commit follows the candidate build and changes only this
  documentation. The candidate's embedded source identity remains `4dfd3ad`.

Only the feature branch is intended for the fork. Main is not advanced, no
upstream changes are integrated, and no PR/release is created.

## Findings

[Presentation details](hk4e-presentation.md): effective Game Mode now uses
**Genshin Impact** for Global and **原神** for China, with the pinned official
publisher shortcut icon. The stable game bundle identifier and actual-process
routing remain. The launcher remains **Yaagl OS**. Direct/Steam setup and helper
identities stay ordinary. Game Mode off retains upstream Wine metadata/PE-icon
behavior. Dock, switcher, application menu and Game Overlay acceptance still
requires a real game; the Windows game-window title is unchanged.

[Preparation investigation](hk4e-launch-preparation.md): the complete production
private-runtime recipe took **25.469 / 24.068 / 21.472 seconds**. Four full
inventories consumed **23.623 / 22.199 / 19.646 seconds**, versus about 1.5 seconds
for APFS cloning and 0.02 seconds for patch/asset/signature work. Separately,
production Wine properties plus window-registry admission/preparation took
**8.619 / 8.569 / 8.531 seconds**. First-use prefix initialization and cleanup
are recorded separately. These independent fixture intervals are not an
end-to-end launch benchmark and must not be added to claim one.

Historical normal-launch logs bounded recipe-to-first-game-created intervals
at about 47 seconds for repeats and 100 seconds during first DXMT acquisition.
They do not explain the complete reported two-minute delay. The candidate adds
monotonic request-linked phase diagnostics, including failure/cancellation and
an explicit game-execution boundary. Nested timings must not be summed.

Next-stage priorities are faster complete hashing/traversal, then safely
amortizing repeated Wine helper startup while retaining durable journals,
ownership and cleanup. Measured opportunity is an upper bound, not a promised
speedup. Existing resource reuse should be investigated only if acquisition
repeats unexpectedly. A persistent runtime cache is not the recommended first
experiment; the investigation documents necessary invalidation/isolation rules
if later measurements justify one.

[Cursor investigation](hk4e-cursor-investigation.md): the user incident remains
unreproduced; coordinate behavior is unchanged. Retina-on and repeat Retina-off
native cases passed all geometry/style checks. Initial Retina-off with a green
button plus duplicate entry request displaced two auxiliary windows while main
windows and Space transitions passed. This discrepancy is recorded explicitly,
with no demonstrated connection to game cursor positioning. No resolution,
Retina, fullscreen, controller or Command/Option policy was changed.

## Verification and delivery

Pinned Node 16.20.2 / pnpm 7.33.7 source checks passed: TypeScript, Prettier,
ESLint with nine pre-existing warnings and zero errors, and **40 Vitest files /
2,200 passed, one optional public-DXMT-archive case skipped**. The focused final
timing/preparation tests passed 108 cases. The separate helper entry also passed
TypeScript checking and three actual non-game production-helper repetitions.

Native checks passed: sanitizer worker/memory fixtures (including four rejected
mutations), real owned-process supervision, eight Perl supervisor subtests,
13 R2 preparation cases, 17 fullscreen/Game Mode composition cases, regional
Foundation loader probes and real-Wine non-game routing/protection/cleanup.
Both asset verifiers passed. The fullscreen geometry discrepancy above is not
counted as a pass. No fixture establishes gameplay or universal feature coverage.

The complete Global candidate built with the documented pinned toolchain from
clean commit `4dfd3ad`. Output: **`build/launch-polish-20261001/Yaagl OS.app`**.
Its `Contents/Resources/manifests/build.json` records the full source SHA;
`build/launch-polish-20261001/verification.json` confirms **562 files**, native
signatures/dependencies, regional host resources/plists, ASAR/frontend identities
and **four xdelta codec round trips**. The launcher native executable has the
same hash as the working installed baseline; this stage did not change its
clipboard/bootstrap implementation. Existing compiler deprecation and frontend
chunk-size warnings remain. The outer bundle is unsigned/unnotarized as before.

The packaged executable rendered its unchanged production frontend in an
isolated profile, reached the expected **Install Game** screen with no error
panel, and exited normally. Seatbelt denied access to the live game/profile;
no game path or executable was supplied and no Wine prefix was created. This
checks launcher rendering/sidecars, not the wrapper's real-profile synchronization
or game readiness. Both owned sidecars stopped, and the disposable profile was
removed after checking open-file references. Packaged Sophon independently
passed health, unknown-task WebSocket and public Global metadata checks with
zero game operations submitted and its server stopped afterwards.

Two initial fixture mistakes were corrected without product changes: the helper
harness's duplicate-slash containment check rejected its own runtime before Wine
started; the smoke assertion expected Settings on the no-game Install screen.
Their failed evidence is retained separately from successful repeats. Installed
application files and live settings retained identical path/byte/mode inventories
after verification. The candidate remains separate; no installation occurred.

## Local evidence

Requested obsolete-build cleanup was completed separately. Its machine-specific
path/identity/deletion inventory, space accounting, process checks and
preservation hashes are local under `.tmp/launch-polish-20261001/`; they are not
committed. The installed application and live profile remain the working baseline.

## Manual acceptance

1. Quit any existing launcher/game normally and wait for cleanup. Open the
   separately staged candidate; do not run two launchers against one profile.
2. Launch Global with usual settings. With effective Game Mode, inspect the
   Dock, Command-Tab, application menu and Game Overlay name/icon. Confirm
   fullscreen Game Mode activation, expected FPS and normal gameplay. Check the
   ordinary Wine presentation with Game Mode off if that route is used.
3. Keep the launcher open through normal game exit and restoration. Confirm
   blank idle status, enabled launch controls and no recovery warning. The
   running text remains `Game is running (DO NOT CLOSE THE LAUNCHER)`.
4. Capture one complete preparation trace using the command in the
   [investigation](hk4e-launch-preparation.md#diagnostic-contract-and-reproducible-capture),
   plus approximate click/running times and settings. Preserve preceding logs if
   the delay comes before the first trace event.
5. For the cursor observation, follow the short
   [capture procedure](hk4e-cursor-investigation.md#short-user-reproduction-and-capture-procedure).
   Note transitions/display/Retina state and actual versus intended hit targets;
   change one setting between fully completed runs. Resolution-reset behavior
   is intentionally untouched.
