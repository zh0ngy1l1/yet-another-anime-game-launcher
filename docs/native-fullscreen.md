# Native macOS fullscreen (HK4E)

In Game settings enable **Native macOS fullscreen**, then launch normally. The
setting defaults off, is independent of FPS unlocking and means “enable the green
fullscreen control.” First launch and every subsequent launch open windowed.
Use the game's green macOS button to enter a Cocoa fullscreen Space, and normal
macOS controls to leave. No automatic fullscreen restoration is implemented: a
reliable saved window size takes precedence over adding entry automation.

Initially supported: the exact public Wine 11.0 DXMT signed-with-patches input.
Other selections retain the preference but fail before game preparation with an
explanation. There is no automatic distro/backend switch. FPS and fullscreen
compose in one unique private APFS copy. Fullscreen-only uses the qualified source
ntdll; FPS combinations use the existing exact R2 ntdll correction. Installed Wine,
loader/server identity, DXMT config, FPS target, Retina and keyboard mappings stay
under their existing settings. No Game Mode host/identity or display-mode change
is part of this feature.

## Window memory and precedence

Unity stores mode, width and height in its own game registry key. Previously the
FPS path restored earlier resolution values and the non-FPS custom-resolution
path deleted them after exit. The new narrowly scoped window transaction reads
valid windowed geometry before rollback, then preserves its intentional record
in `hk4e_window_size_<server>` in the existing profile storage. This works with
FPS/fullscreen disabled too. Raw registry preimages remain independent of that
record and are restored exactly, including absent and non-string values.

Memory is Wine client width/height, with the Retina preference recorded. The
fullscreen driver records settled Cocoa content points from the attributed
UnityWndClass window; the launcher converts these using Wine's Retina scale.
Fullscreen/animation/maximization/closing frames cannot replace that windowed
record. It is committed only on confirmed normal exit; cancelled/failed launches
and missing or malformed observations leave the last record intact. Fullscreen
quit consequently reopens at the last valid windowed size.

A later explicit launcher custom-resolution edit wins over the previous session.
After that launch, a later in-game size wins over the unchanged launcher defaults.
Disabling custom resolution still allows remembered window sizes. Editing the
fullscreen checkbox does not change resolution precedence. A resolution preference
revision distinguishes a new edit from an older default, even if the user returns
to its prior numeric value. With no record and custom resolution off, no default
width/height is imposed. A remembered size is bounded by the current Wine work
area; explicit custom resolution remains the user's requested value. Across-launch
position is left to Wine/AppKit; same-session fullscreen exit restores the saved
frame and owned-window positions.

## Build and recovery

`./build-macos.sh` verifies and packages the tracked matched driver trio, registry
helper, manifests, source patches, licenses and developer build recipes. Normal
runtime acquisition still obtains the pinned original public Wine archive. No
new asset publication or user-side Wine build is needed. Developer asset rebuild:
[driver recipe](../native/wine-fullscreen/README.md) and
[registry helper](../native/window-state/README.md).

Disable the checkbox to return to the ordinary runtime path (or R2 if FPS remains
enabled). Quit normally and wait for cleanup before switching apps or profiles.
Do not delete a retained journal or pending state to bypass a close/launch guard.
An interrupted window transaction is recorded in `hk4e_window_controls_pending`;
startup drains that recorded Wine context, restores its immutable raw snapshots,
and clears the pointer only after cleanup. Interrupted launches do not promote a
new size. An unrecognized/corrupt recovery record blocks startup for inspection.
The previous private runtime can be retained after an interrupted launcher until
all existing game/file restoration has completed; do not remove it while Wine is
alive. Logs identify the runtime and window-controls directory.

The driver emits `yaagl-fullscreen:` transition/geometry diagnostics. “Entered”
is an AppKit callback with native style, not Wine's screen-covering flag. Cocoa
screen/content points and backing scale are not proof of game render-target or
Metal drawable dimensions. Test-only observers may query Spaces; they are never
injected into the product game path. See the validation report for finite observed
coverage and limitations; fixture success alone is not Genshin qualification.
