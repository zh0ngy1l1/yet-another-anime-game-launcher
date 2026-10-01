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
resource cases with the real public ZIP enabled. All ten channel frontends built.
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

Detailed source, package, installation and final delivery results are recorded
below after completion. Local logs: `.tmp/upstream-sync-checks/`; raw public
artifact/source audit: `.tmp/upstream-sync-audit/`.

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
