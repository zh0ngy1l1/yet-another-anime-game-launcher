# Optional HK4E Game Mode support

In Game settings, enable **Native macOS fullscreen** and the separate **Game
Mode** option, then launch. Game Mode defaults off and applies on the next
launch. The game opens windowed; click its green button to enter a native
fullscreen Space. No automatic fullscreen entry/restoration is added.

The setting requests Game Mode eligibility. macOS decides activation and remembers
its own per-game choice. Check **Game Mode On** in the game's macOS Game menu or
Game Overlay; an overlay, checkbox or Gaming Focus alone is not evidence. On
macOS 26, open the overlay from the Game menu or Command-Escape, then Settings.
Use that normal OS control if you wish to change its remembered choice. See
[Apple's controls and requirements](https://support.apple.com/en-us/105118) and
[`LSSupportsGameMode`](https://developer.apple.com/documentation/bundleresources/information-property-list/lssupportsgamemode).

If native fullscreen support is off, Game Mode remains saved but inactive. The
help text and launch log explain the prerequisite. Unsupported host/runtime
configurations fail before launch preparation with an explanation; the launcher
does not switch runtimes. Required capability is Apple Silicon, macOS 14+, and
Wine `11.0-dxmt-signed-with-patches` with DXMT. Actual game qualification is limited
to the tested Apple Silicon/macOS 26.6.2 host, not all eligible systems.

Disable **Game Mode** and relaunch to use the accepted ordinary fullscreen/R2
route again. This does not change macOS's remembered preference. Editing either
checkbox does not modify a running session. Retina, rendering, resolution intent,
FPS target, VSync, keyboard mappings and all other game settings retain their
existing behavior. Window memory, registry recovery and normal ownership-based
cleanup remain as described in [native fullscreen](native-fullscreen.md).

The actual game runs in a small, fixed, signed `YAAGL HK4E.app` inside the existing
request-private runtime. The signed Steam shim, setup tools and FPS helpers keep
ordinary identities. A narrow ntdll child-routing change is required to identify
the resolved executable reliably; Game Mode off retains the accepted runtime
bytes. See [source, licensing, runtime identities and rebuild recipe](../native/wine-game-mode/README.md).

Use a separate candidate app output and disposable profile for validation. Quit
normally and wait for owned game/helper/Wine completion and restoration before
changing apps. Preserve retained journals/pending state after interrupted cleanup;
do not delete them to bypass ownership guards.

A/B testing is a separate stage. No performance benefit is asserted by this
integration or by the previous fullscreen measurements, which had Game Mode off.
