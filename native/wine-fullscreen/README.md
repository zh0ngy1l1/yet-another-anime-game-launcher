# Native fullscreen driver assets

This Wine LGPL-2.1-or-later derivative adapts the fixed-size fullscreen patch from
`zh0ngy1l1/yaagl-fpsunlock-gamemode-legacy` at
`d48bd81bfcd64b337c92d2b53d0dacc3321a9b41`. No legacy installer, loader,
Game Mode host, process identity or runtime routing is included.

`manifest.json` pins the public base archive, Wine and downstream source revisions,
patch, architectures, deployment target, compiler/SDK and every input/output module.
The trio in `sidecar/wine-fullscreen` is built together: x86_64 Mach-O winemac.so
and x86_64/i386 PE winemac.drv. Only this trio is replaced in a verified private
APFS runtime copy. Loader, server and every other file retain their input bytes;
FPS requests additionally select the existing exact R2 ntdll output.

The public distribution has no complete publisher build manifest. The source
correspondence is its Wine 11.0 version and published matching downstream series,
not a claim of a bit-identical publisher rebuild. Compatibility is initially
limited to the three exact original driver inputs plus existing R2 loader/server/
ntdll pins. A distro label or registry switch cannot establish capability.

Developer rebuild (Apple Silicon macOS, Rosetta, Xcode Command Line Tools;
Homebrew mingw-w64, bison, pkgconf, autoconf, xz):

```sh
python3 scripts/build-fullscreen-driver.py --work "$PWD/.tmp/fullscreen-rebuild" --record
python3 scripts/verify-fullscreen-assets.py
```

The fresh work directory downloads checksummed Wine 11.0 source, the public
425 MB qualified runtime archive and dependency headers; checks out the pinned
MacPorts overlay; applies its complete patch series without fuzz; and applies
our reviewed patch. Only the driver target is compiled. Build logs/source are
retained in the selected work directory. `--record` is an intentional developer
asset/manifest update; inspect differences and repeat native/game validation.
The procedure is repeatable; byte equality across SDK/compiler versions is not
promised. The native module is relocated and ad-hoc signed, then strictly verified.

Normal `./build-macos.sh` verifies and bundles the tracked driver trio, manifest,
patch, license and source/build recipes. It needs no legacy checkout, installed
Wine, unpublished archive, asset release or Wine compilation. Normal runtime
acquisition still downloads the original pinned distribution. No publication is
necessary for these checked-in assets, and no release URL is invented.

## Contract

`AllowFixedSizeFullscreen` is REG_SZ Y/N, default absent/off, read once at Mac
driver initialization. `HKCU/Software/Wine/AppDefaults/<exe>/Mac Driver` overrides
the global Mac Driver value. The launcher changes only the actual game's key and
restores presence/type/raw bytes after owned completion. It temporarily selects
Unity windowed mode separately from custom resolution.

The patch preserves the early rejection of undecorated windows and excludes
child, popup, layered, shaped, owned, tool, nonactivating and dialog windows.
Cocoa controls use existing transition callbacks. Pending/closing windows reject
another toggle. Late exit/failure callbacks for a destroyed Win32 window finish
closing its Cocoa shell instead of displaying its old frame. Eligibility changes
and completed/failed/restored transitions have separate diagnostics. The saved fixed window frame and owned-window frames survive
fullscreen geometry updates. There is no automatic entry or reentry.

`YAAGL_WINDOW_STATE_EXE` must exactly match the current Windows image basename,
and must be GenshinImpact.exe or YuanShen.exe. Only its eligible UnityWndClass
window receives the geometry capability. `YAAGL_WINDOW_STATE_FILE` names a unique
request file. Main-thread resize callbacks debounce a write by 750 ms; fullscreen,
maximized, hidden, miniaturized and closing windows cannot write it. Transition
and destruction cancel pending writes. JSON records Cocoa content points and
screen points, not render/backbuffer or Metal drawable dimensions. The launcher
promotes valid geometry only after normal completion and converts using the
unchanged Wine Retina preference. No fullscreen-state restoration is implemented.

`tests/` is adapted from the legacy fixture. Its injected observer and private
Space query are test-only, never packaged with or injected into the game. It
exercises actual AppKit transitions and verifies Space type, Win32 styles,
constraints and geometry. Fixture results are not game qualification.

Run Space-transition fixtures serially in an **unlocked interactive console**.
Do not compile over a running fixture executable or share a test prefix between
cases. A locked session may deliver AppKit callbacks without a fullscreen Space;
that is not successful entry. `YAAGL_TEST_GREEN_BUTTON=1` exercises the standard
button, `YAAGL_TEST_DUPLICATE_TOGGLE=1` tests a second pending request, and
`YAAGL_TEST_CLOSE_DURING_ENTRY=1 YAAGL_TEST_SECONDS=12` closes the Win32 window
while entry is pending. Use `YAAGL_OBSERVER_DYLIB` for the compiled observer.
