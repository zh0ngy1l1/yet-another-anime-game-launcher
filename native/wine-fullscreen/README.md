# Generic fixed-size native fullscreen extraction

This is a review prototype, not a released runtime or an enabled launcher
feature. A confirmed owned-window position-restoration failure blocks submission;
see the auxiliary-update reproducer and the assessment report. It adds an opt-in Mac driver option for ordinary fixed-size top-level
windows. The standard Cocoa green button enters and exits a fullscreen Space;
the Win32 window stays nonresizable. There is no automatic entry.

`AllowFixedSizeFullscreen` is a `REG_SZ` value read at driver initialization.
Absent or `N` leaves the extension off. `Y` enables it. Wine's existing
`HKCU\Software\Wine\Mac Driver` and per-executable
`HKCU\Software\Wine\AppDefaults\<exe>\Mac Driver` lookup and override rules
apply. Restart the test process after changing this option.

## Source and provenance

The patch applies to Wine 11.0 commit
`db11d0fe6a169c457e23d007e20404643d067aa8`, **after** the complete `wine-devel`
patch series and post-extract configure edits from
[`riverfog7/macports-wine`](https://github.com/riverfog7/macports-wine/tree/0d029255bce8f2f4ac47a1984b59ba82e09d9829)
commit `0d029255bce8f2f4ac47a1984b59ba82e09d9829`.
The exact prepared baseline Git tree is
`763e3aa9df162f403f5ef8dcff995c5db58fc044`. Local preparation commits have
generated author/date metadata; their commit IDs are not upstream Wine commits.

The `prepare-sources.py` recipe records the full applied series in
`logs/downstream-series.txt`, applies it without fuzz, and verifies that tree.
Its SHA-256 pins cover the Wine source archive, public reference runtime and
dependency header archives. The reference distribution is
`yaagl/anime-game-wine`'s `wine-11.0-signed` archive, SHA-256
`4ebba536115e937c3826fa5808dbed50cd5e91c8454999b54cbe0cd2a43d8b4c`.
That distribution does not provide a complete publisher build manifest;
source-version/overlay correspondence does not establish a bit-identical
publisher rebuild.

`overlay-registration.patch` is the two-line Portfile registration against that
same overlay commit. Together with the Wine patch it is a concrete candidate for
the overlay's `wine-11.0-fix` source branch, subject to maintainer agreement. In a
separate overlay checkout at the recorded commit:

```sh
cp /path/to/prototype/native/wine-fullscreen/allow-fixed-size-fullscreen.patch emulators/wine-devel/files/
git apply --check /path/to/prototype/native/wine-fullscreen/overlay-registration.patch
git apply /path/to/prototype/native/wine-fullscreen/overlay-registration.patch
```

This registers the new source patch after the existing series. Both the new
patch file and the Portfile change would belong to an overlay contribution.
The distribution-only repository is not automatically the source contribution
location; a direct Wine contribution would need a separately chosen Wine base.

This extraction comes from the accepted fork's
`native/wine-fullscreen/allow-fixed-size-fullscreen.patch` at launcher commit
`86d6c80624413f895806afcdd8ff7f93b059d759` (original patch SHA-256
`2286bb220b8af3b2a5ee8d895a3bf72068b95db660cedb544b12bab104226936`).
That implementation adapts the earlier fullscreen work in
`zh0ngy1l1/yaagl-fpsunlock-gamemode-legacy` at
`d48bd81bfcd64b337c92d2b53d0dacc3321a9b41`. This extraction and its review
materials were prepared with AI assistance. No maintainer or independent human
review is claimed. The Wine derivative remains LGPL-2.1-or-later; the license is
included in `COPYING.LGPLv2.1`.

## What the patch changes

The patch is six Wine driver files, with 93 inserted and seven removed source
lines. These are the only runtime source changes:

| File / symbols | Purpose |
| --- | --- |
| `macdrv_main.c::setup_options`, `macdrv.h` | Read a default-off setting through Wine's existing configuration mechanism. |
| `window.c::get_cocoa_window_features` | Grant a feature bit only to decorated, unowned, fixed-size ordinary windows. Preserve the existing shaped/layered/undecorated rejection and exclude child, popup, tool, nonactivating and dialog windows. |
| `macdrv_cocoa.h::macdrv_window_features` | Carry that bit across the existing driver/Cocoa boundary. |
| `cocoa_window.h`, `cocoa_window.m::adjustFullScreenBehavior`, `setWindowFeatures` | Let eligible windows use Cocoa's existing primary-fullscreen behavior without adding Win32 resize permission. |
| `setFrameFromWine`, fullscreen delegate callbacks | Preserve the windowed frame for the whole transition/session; ignore repeated requests while pending; restore on exit or failed entry. A per-session latch keeps these safeguards if the application changes its style or owner during fullscreen. |
| `restoreNonFullscreenChildFrames`, `finishClosingFullscreenWindow`, `dealloc` | Restore still-owned auxiliary frames using weak keys. Skip closing/detached children, release snapshots, and prevent late closing callbacks from redisplaying a destroyed Win32 window. Failed exit retains the snapshot for retry. |

Before this change Cocoa eligibility required a resizable style. Merely setting
a launcher preference could not give an ordinary fixed-size window a native
fullscreen button. The feature bit extends that eligibility, while the remaining
changes keep the saved windowed frame and object lifetime valid through AppKit's
asynchronous transitions. If a style/owner change removes eligibility during
entry, the driver waits for entry to complete before requesting an exit. An
eligibility recalculation cannot issue a second toggle during a pending or
closing transition, and each feature update recalculates eligibility once. A closing session retains its latch until destruction
so more than one late callback remains harmless.

The patch contains no executable names, Unity class checks, geometry-file
transport, cross-launch window memory, Game Mode metadata, FPS/R2 logic,
controller handling, cursor/Retina/resolution policy, automatic fullscreen,
polling, or new runtime diagnostics. Existing resizable-window behavior is kept;
new transition safeguards are scoped to a session entered through this feature.

## Independent rebuild

Requirements: Apple Silicon macOS with Rosetta, Xcode Command Line Tools, and
Homebrew `mingw-w64`, `bison`, `pkgconf`, `autoconf`, and `xz`. The recorded target
is macOS 14+, x86_64 native Wine with x86_64/i386 PE drivers. Other hosts and
toolchains require their own validation. Use a fresh directory for each arm:

```sh
python3 native/wine-fullscreen/build-driver.py --work "$PWD/.tmp/fullscreen-baseline" --baseline
python3 native/wine-fullscreen/build-driver.py --work "$PWD/.tmp/fullscreen-patched"
```

Each command downloads the pinned public inputs, prepares an independent source
tree, configures the recorded overlay options, and builds only
`dlls/winemac.drv/all`. Homebrew bison is selected for both configure and make.
`--baseline` omits this extraction patch, while retaining the identical overlay
and dependency inputs. A source-tree mismatch stops the build rather than
silently reusing different edits. These recipes derive from the accepted fork's
source/build recipes; they do not replace YAAGL's build or packaging pipeline.

The staged `driver-assets` directory contains:

```text
lib/wine/x86_64-unix/winemac.so
lib/wine/x86_64-windows/winemac.drv
lib/wine/i386-windows/winemac.drv
build-record.json
```

Use all three matched driver outputs together in a **disposable copy** of the
reference runtime. The script relocates the native module's runtime paths,
ad-hoc signs it, verifies the signature, and records compiler/SDK, patch hash and
output hashes. It never installs or launches these outputs. No binaries are
committed with the prototype. A native distribution/release owner, capability
contract and compatibility policy are still needed before launcher integration.

The native patch is independently inspectable/applicable without these helper
recipes:

```sh
git -C /path/to/prepared-wine apply --check "$PWD/native/wine-fullscreen/allow-fixed-size-fullscreen.patch"
git -C /path/to/prepared-wine apply "$PWD/native/wine-fullscreen/allow-fixed-size-fullscreen.patch"
```

## Validation and remaining review

Build and fixture results belong to the accompanying assessment, including the
paired baseline comparison of auxiliary-window displacement. A successful build
alone is not an acceptance claim. The fixture/observer under `tests` run only in
isolated prefixes and inject into the fixture process, never into the game.
They must run serially in an unlocked interactive console; an AppKit callback
without a real fullscreen Space does not establish entry.

Keep the original all-window geometry/style assertions. The unmodified driver
cannot enter fixed-size fullscreen, so baseline-vs-patched resizable-owner runs
are a separate common-path comparison; they cannot excuse a failing enabled
fixed-window run. A synthetic failure callback tests restoration logic, not an
OS-denied transition. Real OS failure, other display configurations and hardware
must remain untested unless separately exercised.

Before personal submission, the contributor should be able to explain why the
eligibility exclusions are needed; why style changes cannot reset the session
latch; why failed exit keeps restoration state while failed entry releases it;
why weak child references and the closing guard matter; and which observations
prove an actual fullscreen Space and exact same-session geometry restoration.
An experienced Wine/AppKit reviewer should examine asynchronous callback order,
child-frame events, dynamic ownership changes and the target baseline. The
accepted game build's user acceptance is evidence about that build, not a claim
that this smaller generic patch has already been reviewed or qualified broadly.
