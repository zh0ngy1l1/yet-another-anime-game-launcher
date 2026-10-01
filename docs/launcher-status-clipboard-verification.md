# Launcher status and macOS clipboard verification

Date: 2026-09-27, macOS arm64 host, HK4E global packaged channel.

This is historical September 27 evidence. Its old running/idle wording and remaining presentation issues were superseded by the [September 28 final polish](launcher-final-polish-verification.md). The build output below has since been removed; unique evidence remains local. The audit grew from 531 rows at this checkpoint to 533 after final polish. Source and tests are now committed on `main`; see [developer handoff](developer-handoff.md).

## Deliverables

- App: `/Users/david/code/home/yaagl_vibecoding/yet-another-anime-game-launcher/build/status-clipboard-reviewed/Yaagl OS.app`
- Human review inventory: [launcher-error-message-audit.md](launcher-error-message-audit.md), 531 scenario/message-family rows with stable IDs. Recommendations outside the requested fixes remain recommendations.
- Production source snapshot: `b08c2815980b245f6981fbe13ff68dcfbe16f760`. A detached local worktree and temporary Git index supplied the clean source required by the packaging script. The user's branch and index were not moved. Nothing was pushed or published. At this checkpoint, the audit and native keyboard test were additional working-tree files.

## Causes and changes

The ownership model previously shared one `detail` value between progress and the red panel. `problem()` latched `failed`, then ordinary `phase()` calls replaced the text without clearing that flag. Normal observation could consequently appear red and displace the original diagnostic. Separate error, warning, status and confirmed-running state now prevent that route. A new reservation clears messages from the previous session. Progress cannot overwrite the red error text, and background phases cannot overwrite the confirmed-running sentence.

The companion's “Game probe” timeout is the deadline for optional FPS discovery/observation through the bridge's serialized mailbox transport. It is separate from the retained game's process lifetime. The transaction previously promoted every companion outcome and observation-history entry to a primary launch failure. Optional failures now produce an amber FPS warning and retain their detailed log/history. Genuine preparation, launch/lifetime and cleanup failures remain errors. A retained, validated request-attributed bridge handle confirms running state; an unrelated process is never accepted. Unknown lifetime still blocks release and uses the existing retry path. No timeout was increased and no process ownership, cancellation, private-runtime or restoration gate was removed.

The exact cause of the original user's slow probe cannot be established without that run's logs. The delayed-probe regression establishes the problematic combination—confirmed running game plus timed-out optional observation—and verifies the corrected outcome.

The native macOS WebView lacked the standard Edit responder-chain menu. Additionally, Neutralino's `window.setIcon` replaced the entire main menu with a Quit-only menu. The native build patch installs standard Undo/Redo/Cut/Copy/Paste/Select All actions with nil targets and preserves that menu when the icon changes. There is no global JavaScript keyboard interception and no change to Wine/game key mappings or text-selection implementation.

## Automated and package checks

| Check | Result / evidence |
|---|---|
| Full Vitest suite | **35 files, 2,137 tests passed**; `.tmp/status-reviewed-tests.log`. Includes normal phase routing, confirmed running plus delayed probe timeout, optional worker errors, genuine game failure, cleanup gates, and a later successful launch after an earlier failure. |
| TypeScript, focused ESLint, diff whitespace | Passed. Packaging also runs TypeScript and the production frontend build. |
| Full macOS build | Passed with pinned Node 16.20.2 / pnpm 7.33.7; `.tmp/status-package-reviewed-build.log`. |
| Package verification | 554 files verified; four xdelta round trips; native/helper assets, dependencies, signatures and Game Mode checks passed. |
| Native keyboard regression on delivered executable | `node scripts/test-macos-clipboard.cjs 'build/status-clipboard-reviewed/Yaagl OS.app/Contents/MacOS/Yaagl'` passed; `.tmp/status-reviewed-clipboard.log`. |

The keyboard test launches the **packaged executable with isolated fixture resources**, performs real macOS Command keystrokes, checks the system clipboard, pastes into a new TextEdit document, and verifies field select-all/paste/cut. It exercises both initial icon setup and a subsequent `window.setIcon`. Its result explicitly says `productionResources: false`; this is not represented as a production UI test. Adding the icon step reproduced the bug in the first candidate (`.tmp/status-clipboard-icon-before.log`); the corrected native build passes it. Fixture evidence for the delivered executable is in `/var/folders/nn/34wh2q094x5f5qrtj4n8c76r0000gn/T/yaagl-clipboard-ZJVqea`.

## Live production-resource checks

Live tests use an APFS clone of the installed game and an isolated clone of the launcher profile under `.tmp/status-live/`. The packaged resources are copied unchanged into that profile, and its game path points to the cloned game. A Seatbelt profile denies access to the original game and writes to the original profile. Network-host modification was disabled in the cloned settings. The executable runs with the profile as its working directory, matching the app wrapper's relative sidecar-path requirement. This does not test the wrapper's profile synchronization against the user's real profile.

An initial direct invocation from the repository directory failed to find the relative Sophon sidecar and displayed the real startup error dialog (`reviewed-startup.png`). That was a test-invocation error, not a packaged startup regression. It was corrected by using the isolated profile working directory; no production source was changed to work around it.

The preceding package, with the same native menu fix, launched the cloned game to its animated **Start Game** screen. The launcher displayed exactly `Game is running. DO NOT CLOSE THE LAUNCHER!`, with no red error or FPS warning. Real mouse selection and Command-C copied that production status; Command-V pasted it into TextEdit (`running-pasted-textedit.txt`, `running-selected.png`). The real HTTP Proxy Host field supported Command-A/C/X/V (`field-now.png` shows the cut field). The game exited through its own exit confirmation, and the launcher completed cleanup and displayed `Game has exited. Ready to launch.` (`after-exit.png`, `final-console.log`).

On the **delivered package**, an isolated invalid enabled FPS target of `0` produced the genuine red message `Error: Invalid enabled Target FPS; expected an integer from 1 to 360`, with no game created (`reviewed-invalid-fps.png`). Mouse selection plus Command-C copied the exact production error (`reviewed-error-copy.txt`). In the actual Game settings field, Command-A/X cut `0` to the clipboard and Command-V pasted `120`; the saved setting became `120` (`reviewed-field-cut.txt`, `reviewed-field-paste.png`). The subsequent launch in the **same launcher session** reached the Start Game screen, cleared the earlier red error, and displayed the exact running sentence without a warning (`reviewed-running.png`, `reviewed-game.png`). Selecting that production status and using Command-C followed by Command-V in TextEdit reproduced the exact sentence (`reviewed-running-copy.txt`, `reviewed-running-textedit.txt`).

The delivered package also completed normal exit and cleanup after the recovery launch, returned to `Game has exited. Ready to launch.`, and enabled Launch Game (`reviewed-after-exit.png`, `reviewed-live-console.log`). The test launcher was then closed normally.

## Limits

- Native clipboard behavior was checked with real macOS keystrokes and TextEdit, not inferred from source or JavaScript unit tests.
- The game reached the Start Game screen; no claim of entering the world or completing gameplay is made.
- The optional probe timeout and worker failure were injected in automated lifecycle tests, not deliberately induced in the live game. The user's original timing failure was not reproduced live.
- Other supported clients and the hundreds of audit scenarios were inspected in source, not all executed. The audit records unresolved routing and arbitrary external-error families explicitly.
- Live logs confirm normal lifetime and cleanup acknowledgements. Independent before/after byte comparisons of every restored registry/file value were not collected; restoration failure and retry behavior is covered by the existing automated tests.
- Existing technical wording for genuine errors and unrelated product decisions are preserved for human review. For example, a pre-transaction FPS validation error can leave “Preparing launch” in the status while its actionable red error is visible; this is recorded as a remaining presentation limitation, not a successful launch claim.

Evidence paths above are relative to `.tmp/status-live/` unless explicitly prefixed otherwise. They are local verification artifacts, not published data.
