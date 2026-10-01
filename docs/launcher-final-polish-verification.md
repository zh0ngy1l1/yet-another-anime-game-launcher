# Final launcher presentation polish and installation

Verified and installed on 2026-09-28, macOS arm64.

- Installed app: `/Applications/Yaagl OS.app`
- Rollback app: `/Applications/Yaagl OS.rollback-20260928.app`
- Historical build output (since removed): `/Users/david/code/home/yaagl_vibecoding/yet-another-anime-game-launcher/build/status-polish-20260928/Yaagl OS.app`
- Source revision: `ccd4a7975649f0387bf6499ee6e05fd14e731912`

At installation, this revision was a local detached build snapshot of the working source, including the previous status/clipboard fixes tested by the user. A separate Git index supplied the packaging script's required clean checkout; the user's branch/index were not moved. Every modified production source and test was compared against the snapshot after installation. Documentation was still in the working tree at installation. Nothing was pushed or published.

Repository reconciliation, 2026-09-30: normal-history commit `29ce22b` has exactly the same Git tree as `ccd4a7975649f0387bf6499ee6e05fd14e731912`. The installed build manifest still identifies that snapshot. Later changes only organize documentation; no app rebuild or installation was performed. See [developer handoff](developer-handoff.md) for current provenance and new source checks.

## Before and after

| Before | Now |
|---|---|
| `Game is running. DO NOT CLOSE THE LAUNCHER!` | Exactly `game is running (DO NOT CLOSE THE LAUNCHER)` in confirmed-running state and English `GAME_RUNNING`; confirmation timing unchanged. |
| `Game has exited. Ready to launch.` / `Startup restoration completed` | Blank idle status after successful completion. Clearing belongs to the current reservation and cannot clear newer progress. |
| Ownership/game-lifetime/startup-restoration jargon | Plain explanations of what cannot be confirmed/restored, blocked close/launch, and the available action. Underlying diagnostics retained. |
| Observation retry labeled `Retry safe cleanup` | `Check game status again`; actual cleanup keeps `Retry safe cleanup`. Same callbacks and guards. |
| Recovered cleanup history leaves a red failure / `Launch stopped` | Once all cleanup gates confirm recovery, cleanup-only history is logged and error/status clears. Genuine primary failures and unresolved restoration remain visible. |
| Unknown exit code described as unexpected game exit | A non-error warning explicitly states that the game exited but its exit status could not be determined. Confirmed abnormal exits remain errors. |
| Failed prelaunch validation leaves `Preparing launch` | `Launch stopped. See the error above.` with the original actionable validation message. |
| Intentional cancellation/cleanup wait receives startup-failure heading | `Closing Yaagl OS.` and cleanup progress; genuine startup failures keep their failure heading, and genuine cleanup rejection stays visible. |
| Aria2 FIXME, bare assertions, `Unexpected behavior!`, raw command/JSON dumps, end-user native build-script instruction | Operation/feature-specific explanations. Original exception/cause, command/stdout/stderr, result JSON and runtime context remain in diagnostics. Useful native message/code/path and explicit validation details remain visible. |

The [audit](launcher-error-message-audit.md) updates 32 existing targeted entries, adds UI-026 for unknown exit status and UI-027 for blank startup completion, preserves historical text, and refreshes source references. It now has 533 distinct IDs. Its broader coverage limits still apply.

## Checks performed

- Full Vitest suite: **36 files, 2,145 tests passed** (`.tmp/polish-all-tests.log`). Added/updated coverage includes normal progress, exact running wording, probe-timeout/optional-feature separation, genuine game failure, unknown exit status while descendants remain alive, unresolved restoration, recovered cleanup, prelaunch validation, retry labels, cancellation, blank idle status and stale-completion protection. Existing process attribution and restoration checks remain.
- TypeScript, ESLint on changed TypeScript files, formatting and `git diff --check` passed. Native build and frontend packaging succeeded with Node 16.20.2 and pnpm 7.33.7.
- Package verification: **554 files**, four xdelta round trips, pinned native/helper assets, signatures/dependencies and fullscreen/Game Mode checks passed (`.tmp/polish-build.log`).
- Native bootstrap fixtures using the newly built native executable and actual startup code: deliberate cancellation with a cleanup veto, unavailable service, and retry-to-ready all passed. Each exited normally after cleanup acknowledgement. Screenshots were inspected: cancellation says `Closing Yaagl OS.`; genuine service failure says `Yaagl OS could not finish starting.` Evidence: `.tmp/polish-native-evidence/bootstrap-native-zbFRxz/`, `.tmp/polish-native-tests.log`. These are isolated fixtures, not production profile tests.
- Before installation, the existing launcher showed its enabled Launch Game button, and process/log inspection found no active game, owned Wine execution or cleanup. The launcher and sidecars exited through normal native termination; no force quit or protection bypass was used.
- The previous installed bundle was moved intact to the rollback path. Hashes and file modes confirm it is unchanged. The staged and installed new bundles match every file and mode in the build manifest (`.tmp/polish-install/installed.json`).
- Started `/Applications/Yaagl OS.app` with `open -n`, exercising its normal `parameterized` wrapper and `~/Library/Application Support/Yaagl OS R2` profile. Verified executable path, process working directory, sidecar startup, native ready log and visible ready UI. **Bottom status is blank**, Launch Game is enabled, and no red error or warning is shown (`.tmp/polish-install/installed-startup.png`, `startup.log`). The installed app was left open and idle.
- All **22 settings files** have identical hashes before/after the smoke test. A separate settings backup is retained at `.tmp/polish-install/settings-backup`. No game was launched or game files edited during this pass.

The initial installation safety check matched its own shell command text and aborted before any bundle replacement; a subsequent startup opened the old bundle. That idle app was closed normally, and installation was rerun with executable-name checks. The successful installation and smoke evidence above are from the new revision.

## Limits and deferred work

This pass did not repeat gameplay or the extensive native clipboard investigation. The native Edit-menu/icon preservation fix and Wine/game keyboard mappings were preserved. Lifecycle faults were exercised in automated tests; no live game crash, probe timeout or restoration failure was induced against the user's profile. Blank status after startup was verified live; after-game blank status was verified by lifecycle tests.

Deferred as requested: ignored prompt responses; download polling/state handling; missing asynchronous settings catches; and startup's artwork dependency. The pre-existing `exec2` per-event stream-capture limitation is also recorded in the audit; this pass preserves available diagnostics without changing that behavior.

Rollback: after the new launcher exits normally and no game/cleanup is active, move the new app aside and put `/Applications/Yaagl OS.rollback-20260928.app` back at `/Applications/Yaagl OS.app`. Its normal wrapper will restore that bundle's resources to the same profile; settings are separate from the bundle.
