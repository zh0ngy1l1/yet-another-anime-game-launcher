# Understanding the patch before submitting it

Wine already knows how to put a Mac window into native fullscreen. Its ordinary
eligibility rule expects a resizable Cocoa window. A game can create a decorated
but fixed-size Windows window, so the corresponding Mac window does not get the
same green-button fullscreen behavior. Adding a launcher checkbox alone cannot
change that native rule.

The patch adds one default-off Wine setting, `AllowFixedSizeFullscreen`. Wine
reads it when the driver starts, using its existing global/per-application
configuration mechanism. `macdrv_main.c` and `macdrv.h` hold that setting.
`window.c` grants a new feature bit only to suitable decorated, unowned,
fixed-size windows. Special windows such as dialogs, popups and tool windows
stay outside the extension. `macdrv_cocoa.h` carries the bit to the Mac side.
There is no Genshin name check and no change to the Windows resize permission.

`cocoa_window.h` stores the small amount of per-window state;
`cocoa_window.m` uses the feature bit to allow Cocoa's fullscreen behavior.
The user still enters and exits with the ordinary green button. The patch does
not enter automatically. Tests confirm real fullscreen Spaces, rather than
assuming that a callback or maximized rectangle proves native fullscreen.

Transitions are asynchronous. Before entry, Wine remembers the windowed frame.
The patch keeps fullscreen geometry messages from replacing that saved frame.
A session flag remembers that this transition began through the fixed-window
feature, even if the application changes its window style during the transition.
Repeated requests are ignored while the current transition is pending. If eligibility
changes during entry, its forced exit is deferred until entry completes.

On ordinary exit, the saved frame is restored and Wine receives its normal
resize notification. Failed entry restores windowed state; failed exit keeps
the saved state for another attempt. If the game destroys its Windows window
while Cocoa is still transitioning, late callbacks hide the remaining Cocoa
shell instead of restoring a ghost window. The closing-session flag stays set
so a second late callback cannot undo that protection.

Owned windows make restoration harder. The patch keeps weak references and
saved frames for attached auxiliary windows, skips destroyed/detached children,
and releases the saved records. But the new reproducer demonstrates a remaining
problem: a child explicitly moved while its fixed parent is fullscreen returns
to the wrong position on exit. The requested size survives. Equivalent
resizable-parent runs preserve the entire requested frame. This is a real
submission blocker, not something the passing parent-window checks excuse.

Everything here is same-session state in memory. Saving a game window's size
between launches, writing a YAAGL state file, changing game registry preferences,
recovering a killed launcher, and providing a Game Mode app identity are separate
contributions. FPS unlocking, R2, Retina/cursor policy and performance tuning are
outside the patch. The eventual launcher integration still needs safe temporary
registry restoration; shipping the driver in Wine does not make those writes
disappear.

Before submitting, be able to answer these questions:

- Which windows become eligible, and why are the exclusions necessary?
- Why is a session flag different from the current eligibility flag?
- What happens after failed entry, failed exit, or destruction between callbacks?
- Why are child references weak, and how should application-directed child
  movement interact with AppKit's own movement? The present prototype does not
  yet answer this correctly.
- Which source/overlay release will maintain the patch, and who rebuilds and
  tests it when Wine changes?
- What did the actual tests establish, and which OS/display/process routes
  remain untested?

You have accepted the working application, but that does not mean you have
reviewed this new generic extraction. Read the code and failing reproducer,
obtain experienced Wine/AppKit review, and decide what maintenance you can own.
AI assistance is disclosed. No human review, maintainer endorsement or broad
compatibility is claimed for you.
