# Upstream synchronization verification — 2026-09-30

Runtime acceptance with DXMT `654f547` is pending the user's in-game test.
No game is launched by this integration's verification.

## Starting point and history

- Clean local `main` and fetched `origin/main` both:
  `29d16dcbf9a785736609768b1aa7ac3b59f85a8d`. No merge/rebase in progress,
  no local-main-only commits, and no unrelated working changes.
- Fetched and inspected `upstream/main`:
  `fc56d843461a313fdc5c19af2a2a47eaf8f2f6ac`.
- Common ancestor: `514ebed106dc8c3b986a655d39d5bded8753941b`.
  Starting fork/upstream difference: 64 ahead / 4 behind; fork/origin: 0 / 0.
- Existing remote URLs verified without replacement:
  `git@github.com:zh0ngy1l1/yet-another-anime-game-launcher.git` and
  `https://github.com/yaagl/yet-another-anime-game-launcher.git`.
- Backup: `backup/pre-upstream-sync-20260930-29d16dc`.
  Integration: `sync/upstream-20260930-fc56d84`.
- Real reviewed merge: `dc3cfff69528ecfef0680827ae77cdb6b20089fc`, parents
  `29d16dc` and `fc56d84`. No rebasing, squashing or published-history rewriting.
  Four earlier detached build worktrees and their source commits are retained.

## Resolution and compatibility

Inspected each incoming patch (`583fc61`, `036ba6b`, `e293c71`, `fc56d84`).
The sole conflicted file was `src/downloadable-resource.ts`. Restored upstream
MoltenVK/DXVK exported helpers after confirming their removal was unused-code
cleanup, without adding obsolete Wine/backend choices. Preserved ReShade's
`configureGame = true` default and explicit journaled preparation helper.
Removed the unused semver import, brought the commit-string version and ZIP/TAR
changes together, and retained the HSR argument fix and explicit unknown-update
error. Reviewed cleanly merged app/HSR code as well as conflict resolution.

Follow-up resource checks reject missing/empty/non-file DXMT cache entries,
validate extracted installation completeness, await version persistence and pass
paths as shell arguments. Regression fixtures exercise real ZIP/TAR extraction,
old-version upgrade, reuse/repair, extraction failure, special-character paths,
restored helper APIs and deferred ReShade configuration. The actual public ZIP
was also installed by the production generator into an isolated test profile.
See [measured DXMT provenance and compatibility](dxmt-654f547-audit.md).

The English running text is exactly
`Game is running (DO NOT CLOSE THE LAUNCHER)`. Normal completion remains blank;
no ready notices or Command/Option remapping were restored. HK4E supervision,
private Wine/R2, journals, recovery, optional fullscreen/Game Mode and Sophon
behavior remain covered by the existing regression suites.

Three concrete pre-existing compatibility breaks found during this audit were
also corrected with small adapters: stock Neutralino startup for legacy clients;
HK4E packaging through the matched native builder (including universal and test
variants); and complete-bundle updates for custom-native builds. Stock clients
retain upstream resource updates. Tag build prerequisites now match the pinned
native build. These changes do not introduce controller support or publish a
release/PR.

## Verification record

Node `16.20.2` / pnpm `7.33.7`: frozen install and secret generation completed.
TypeScript, full ESLint and Prettier passed; ESLint reports nine existing warnings
and zero errors. Full Vitest: **39 files / 2,195 tests passed**, including all 22
resource cases with the real public ZIP enabled. All ten channel frontends built; a final pass after the shared adapters uses
`.tmp/upstream-sync-frontends-final/`.
Fifteen isolated legacy/native packaging adapter checks passed; changed build
scripts parse and the tag workflow YAML parses. HSR's command diff matches the
upstream patch exactly. The native startup adapter's 22 tests preserve required
HK4E admission while covering supported legacy channels and terminal startup.

Initial independent checks passed: 125 Python tests across nine suites, eight
Perl supervisor subtests, native ASan/UBSan worker and memory checks including
four rejected mutations, real OS supervision fixtures, 13 R2 preparation cases,
16 fullscreen/Game Mode composition cases and eight authored loader-probe cases.
Both native asset verifiers passed. Public Wine archive and seven cached native
inputs matched existing manifest pins. Preparation used disposable copies;
loader probes executed only their authored fixture, with no game or live prefix.

Local logs: `.tmp/upstream-sync-checks/`; raw public
artifact/source audit: `.tmp/upstream-sync-audit/`.

## Packaged and installed candidate

- Both the Global production bundle and the universal `YAAGL_TEST=1` route built
  from clean commit **`f00f01cdb5cc8fdb4d15b2f052bedb679dd73443`**. Later delivery
  changes are documentation only. Both package verifiers passed **554 files**,
  native/sidecar/ASAR identities, signatures/dependencies, profile and bundle
  identifiers, the new DXMT download URL, complete-bundle update policy, and
  **four xdelta codec round trips** each. The universal test profile/identifier
  and both region-selection markers were checked; it was not launched.
- Global candidate:
  `build/upstream-sync-20260930/Yaagl OS.app`.
  Universal routing check output: `Yaagl Uni Test.app`.
  Build logs: `package-global.log`, `package-universal-test.log` under the checks
  directory. The package declares its exact source SHA in `manifests/build.json`.
- Installed: **`/Applications/Yaagl OS.app`**.
  Recoverable previous app:
  **`/Applications/Yaagl OS.rollback-before-upstream-20260930.app`**.
  The earlier `/Applications/Yaagl OS.rollback-20260928.app` was also retained.
  No running app was replaced. Staging, installed and previous bundles matched
  all recorded file hashes/modes; the old bundle has 554 files as well.
- The normal installed wrapper reached a visible **Launch Game** screen with
  blank status and no red error/warning. Native readiness and sidecar startup
  were checked. Sophon had transient cold-start connection retries, then became
  ready. No install/update/repair or launch action was selected.
- Manual launcher-update action produced the complete-app-bundle informational
  dialog, verified from its owned dialog process invocation; no upstream
  resource update was offered. Normal native quit invoked the cleanup hook and
  both sidecars stopped. AppleScript's immediate `-128` reflects the native
  asynchronous close veto; the launcher then exited normally. The candidate
  was reopened for the user's test and reached native readiness a second time.
- All **22 stored settings** retained identical hashes. All **2,795 Wine-prefix
  metadata entries** (paths, sizes, mtimes, modes, inodes) were unchanged. DXMT
  remains `0.80.0` in the user's live cache until the next launch acquires the
  upgrade. No game, prefix or shared Wine files were changed to test the new
  component; acquisition verification used isolated directories.
- Installed executable clipboard fixture passed copy of status/error text,
  select-all, cut/paste and transfer to TextEdit, including icon changes. It
  used isolated fixture resources and then exited; the prior text clipboard
  was restored if it still held the fixture's text.
- Compiled Global Sophon passed isolated health, unknown-task WebSocket and
  public Global `7.1.0` metadata checks, submitted zero game operations and
  stopped its service. This verifies the packaged service, not an update run.

Installation/screenshot/preservation evidence lives in `.tmp/upstream-sync-install/`.
Recovery of the old app after trying the new graphics version also needs its old
DXMT cache/version marker: a read-only copy of the prior `dxmt/` and all storage
files is retained at `.tmp/upstream-sync-install/profile-recovery/`. Restore only
with the launcher/game fully stopped; do not replace a live prefix or remove
ownership/recovery guards. Application replacement itself preserved all settings.

## Test setup failures and remaining limits

The first stock-Neutralino fixture omitted its configured icon and crashed in
`window::setIcon` (PID 44916, the report supplied during this task). A second
fixture omitted Vite's channel environment export and correctly displayed the
required-native-runtime error. Both were isolated harness mistakes; no product
source fix or guard relaxation was used to hide them. After preflight verified
both icon and baked `hkrpgos` channel, the real stock-native fixture passed visible
startup, rendering, clock release and normal cleanup/exit. All fixture processes
ended. Evidence: `stock-bootstrap-summary.json` and
`stock-bootstrap-dVaHP1/result.json` in the checks directory.

Native compilation emits existing C++/AppKit deprecation warnings; frontend
bundles emit size warnings. No new source-check errors remain. Public graphics
are downloaded at launch, not embedded in the app. Their checksum is recorded
as provenance, not enforced by the inherited downloader. DXMT requires at least
macOS 15 by binary metadata; outer app remains unnotarized. New graphics gameplay,
older OS versions and non-Global gameplay remain unqualified. Stock client runtime
smoke used an aliased app fixture to avoid automatic Wine setup; it is not live
HSR/BH3/NAP/CBJQ gameplay evidence. Remote CI/release publication was not performed
as a validation substitute.

## Manual acceptance still required

1. Open the candidate and enter the world; allow the new DXMT resource download.
2. Use the usual FPS unlock settings; verify the requested behavior and running
   status without an erroneous launch-failure panel.
3. Enter native fullscreen with the macOS green button; verify Game Mode in the
   OS game menu/overlay when enabled.
4. Return to windowed mode; check prior position/size and saved size on relaunch.
5. Exit normally, keep the launcher open through cleanup, and confirm blank idle
   status, enabled launch controls and no unresolved restoration warning.
6. Relaunch and repeat world entry/fullscreen/exit. Report any new graphics,
   FPS, Game Mode, geometry or cleanup regression with launcher/game logs.

Earlier runtime reports describe the previous graphics combination only. Neither
successful packaging nor static ABI/config checks qualify this upgrade in-game.
The [upstream contribution plan](upstream-contribution-plan.md) separates required
native/runtime dependencies from FPS coupling and proposes coherent PR boundaries.
