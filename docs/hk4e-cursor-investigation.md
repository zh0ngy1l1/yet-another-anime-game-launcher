# HK4E cursor investigation, 2026-10-01

The single reported cursor-position incident remains **unreproduced**. The user
reports many successful gameplay runs with the previously installed candidate.
No coordinate, Retina, resolution-persistence, capture or fullscreen behavior was
changed in this investigation. No real game was launched.

## Evidence and source review

The [previous fullscreen validation](native-fullscreen-validation-20260923.md)
observed usable in-game menus and exact fullscreen frame restoration with Retina
off. It explicitly excluded Retina on, monitor changes and physical relative
pointer capture. Those results cannot establish the cause of this later incident.
No timestamped incident trace, before/after coordinates or repeatable sequence
was supplied or found in the retained fullscreen evidence.

Reviewed the pinned Wine 11.0/MacPorts source retained by the
[driver build recipe](../native/wine-fullscreen/README.md), alongside the current
[fullscreen patch](../native/wine-fullscreen/allow-fixed-size-fullscreen.patch),
[Wine settings](../src/wine/wine.ts),
[window memory](../src/clients/mhy/hk4e/window-state.ts) and
[session transaction](../src/clients/mhy/hk4e/window-session.ts):

| Concern | What the source establishes | Remaining limit |
| --- | --- | --- |
| Logical points versus Wine coordinates | Wine's `macdrv_cocoa.h` conversions use active `retina_on`: Mac-to-Wine doubles and Wine-to-Mac halves when enabled. `cocoa_app.m` applies that same state to absolute pointer positions, relative deltas, cursor warps and clip rectangles. Physical backing scale and Wine Retina state are separate quantities. | A 2× screenshot or panel backing scale alone does not prove an input-coordinate error. Actual game input positions were not captured. |
| Changing the launcher Retina preference | `wine.setProps()` writes `RetinaMode`, then waits for that prefix's wineserver to exit before game preparation proceeds. Wine reads the preference at driver initialization; the launcher checkbox does not mutate an already running game's pointer transform. | A game/display-mode transition can change Wine's active Retina state separately; changing a launcher preference between runs is not equivalent to changing a display during a run. |
| Fullscreen restoration | The fork saves the Cocoa windowed frame before entry, protects it from fullscreen geometry updates, restores it on exit, then invokes Wine's existing resize notification. The patch does not replace pointer, capture or clipping conversions. | Exact frame restoration does not prove Unity hit-testing or relative capture is correct. |
| Cached display measurements | `applicationDidChangeScreenParameters:` invalidates the cached primary-screen height/screen rectangles and requests a fresh absolute mouse baseline. Activation also resynchronizes Wine display state. `setRetinaMode:` updates windows and clipping-handler state; `check_retina_status()` compares the current and original display modes. | Source contains refresh paths, but this investigation did not exercise physical monitor hotplug, display-mode changes during fullscreen or every event ordering. |
| Remembered dimensions | Stored fullscreen-driver observations are Cocoa content points; launcher conversion produces Wine client units and records the Retina preference. This is launch-time window-size persistence, not a cursor transform. | Resolution resets mentioned in the request are explicitly outside this investigation and remain unchanged. |

The review found no demonstrated mismatch tying the reported incident to these
paths. A transition-specific input problem remains possible, but there is no
evidence supporting a global multiplier, forced resolution or disabled feature.

## Non-game verification

The existing [Win32 fixture](../native/wine-fullscreen/tests/fullscreen.c) and
[Cocoa observer](../native/wine-fullscreen/tests/observe-fullscreen.m) were built
from the current sources and run serially with an isolated prefix and private
clone of the qualified Wine runtime. The source driver hashes were checked
against `inputSha256` in the manifest; the clone used the exact tracked final
driver trio. `python3 scripts/verify-fullscreen-assets.py` passed.

Three 60-second cases ran serially on macOS 26.6.2, draining the disposable
prefix's wineserver between cases. The existing fixture checks genuine type-4
Spaces, repeated entry/exit, fixed/resizable and constrained windows, excluded
window types, unchanged Win32 styles, all 12 restored geometries and no automatic
reentry.

| Case | Result |
| --- | --- |
| Retina off, green button plus duplicate pending toggle, first fixture run in the fresh prefix | Cocoa observer passed; all Win32 styles/client sizes were preserved. The all-window geometry check failed for the auxiliary owned window and owned dialog; the four fullscreen parent windows restored exactly. |
| Retina on, green button plus duplicate pending toggle | Cocoa observer and all 12 Win32 geometry/style checks passed. |
| Retina off again, direct native toggle without duplicate request | Cocoa observer and all 12 Win32 geometry/style checks passed. |

The first case moved the auxiliary owned window from `(155,146)` to `(-278,36)`
and the owned dialog from `(230,212)` to `(-203,36)`, retaining their client sizes
and styles. This is a real failed fixture assertion, not a fully passing suite.
It did not recur in the two following cases; those cases also changed the
Retina/toggle conditions, so they do not isolate its trigger. Historical fixture
logs had restored these auxiliary windows. There is no demonstrated connection
to the game's cursor incident, and no speculative geometry correction was made.

The fixed Win32 client stayed `480×300` in both Retina modes, corresponding to
Cocoa `480×300` points with Retina off and `240×150` points with Retina on.
Backing scale was `2.0` in both cases. This confirms the distinction between
Wine Retina coordinates and physical backing scale in these fixtures.

These fixtures observe geometry and fullscreen transitions. They do **not** test
physical pointer movement, game hit targets, relative mouse capture, monitor
changes, a scale change within one process or a Game Mode host. Consequently,
even successful fixtures cannot qualify the reported cursor behavior.

Portable rerun: follow the [driver fixture instructions](../native/wine-fullscreen/README.md)
using a disposable runtime/prefix; set `RetinaMode` with that runtime's `wine reg`
in the test prefix, drain its server, then invoke `tests/run-case.sh` with
`YAAGL_TEST_GREEN_BUTTON=1 YAAGL_TEST_DUPLICATE_TOGGLE=1`. Repeat after switching
only the disposable prefix's Retina value. The observer is test-only and must
never be injected into the game.

The disposable runtime and prefix were removed after owned process completion;
raw fixture/observer logs remain local under `.tmp/hk4e-cursor-investigation/`.

## Short user reproduction and capture procedure

1. Note the candidate source revision, server, Wine/backend, Retina, native
   fullscreen, Game Mode, FPS and Steam Patch settings. Note connected displays,
   macOS display scaling and whether any changed since the previous launch.
2. On a normal launch, test the same menu targets near the center and each corner
   while windowed, after green-button fullscreen entry, after exit, and after
   switching away and back. Note whether menu clicks miss, the visible cursor is
   displaced, or relative camera movement is wrong; these are different symptoms.
3. If testing the suspected Retina connection, quit normally and wait for launch
   cleanup before changing only Retina for the next run. Record the exact order.
   Do not force a resolution or change persistence to compensate for a miss.
4. At the first mismatch, record the time, the immediately preceding transition,
   the intended target and actual activation point. A short recording with the
   pointer visible, or a screenshot plus marked intended/actual points, is useful.
   Record whether leaving fullscreen, changing focus or a normal relaunch clears
   it, without changing several settings together.
5. Preserve that run's profile `neutralinojs.log` and matching `logs/game_*.log*`
   before another run. The launch diagnostic identifies its Wine output path;
   `yaagl-fullscreen:` lines contain entry/restore state, Cocoa content/screen
   dimensions and backing scale. Use the profile actually opened by the app;
   defaults are documented in [build-macos.md](build-macos.md). Keep raw logs and
   account-bearing captures private. These logs do not currently record every
   pointer position; a reproducible sequence would justify a narrowly targeted
   follow-up capture.
