# Isolated native fixtures

Run serially in an unlocked interactive macOS console. These are non-game
fixtures. Their injected observers and private Space queries are test tools,
never runtime components or game injections. The original `fullscreen.c`,
`observe-fullscreen.m`, `check-geometry.py` and `run-case.sh` are byte-for-byte
copies of the accepted fork's fixture. No failed assertion was removed.
Install Homebrew `ripgrep` (`rg`) in addition to the parent README's build tools;
the unchanged historical runner uses it to check observer output.

First build both arms as described in the parent README. Use fresh disposable
directories; these commands must not target installed Wine or a game prefix:

```sh
fixture_work="$PWD/.tmp/fullscreen-fixtures"
mkdir -p "$fixture_work/tests"
cp -cR .tmp/fullscreen-baseline/runtime "$fixture_work/baseline-runtime"
cp -cR .tmp/fullscreen-patched/runtime "$fixture_work/patched-runtime"
cp -R .tmp/fullscreen-baseline/driver-assets/lib "$fixture_work/baseline-runtime/"
cp -R .tmp/fullscreen-patched/driver-assets/lib "$fixture_work/patched-runtime/"

x86_64-w64-mingw32-gcc -O2 -Wall native/wine-fullscreen/tests/fullscreen.c \
  -o "$fixture_work/tests/fullscreen.exe" -lgdi32
clang -arch x86_64 -dynamiclib -framework Cocoa \
  native/wine-fullscreen/tests/observe-fullscreen.m \
  -o "$fixture_work/tests/observe-fullscreen.dylib"
x86_64-w64-mingw32-gcc -O2 -Wall native/wine-fullscreen/tests/auxiliary-update.c \
  -o "$fixture_work/tests/auxiliary-update.exe"
clang -arch x86_64 -dynamiclib -framework Cocoa \
  native/wine-fullscreen/tests/observe-auxiliary-update.m \
  -o "$fixture_work/tests/observe-auxiliary-update.dylib"
clang -arch x86_64 -dynamiclib -framework Cocoa \
  native/wine-fullscreen/tests/failure-callbacks.m \
  -o "$fixture_work/tests/failure-callbacks.dylib"
clang -arch x86_64 -dynamiclib -framework Cocoa \
  native/wine-fullscreen/tests/observe-green-buttons.m \
  -o "$fixture_work/tests/observe-green-buttons.dylib"

python3 native/wine-fullscreen/tests/run-matrix.py --work "$fixture_work" \
  baseline-off patched-off patched-on patched-on-repeat patched-retina \
  patched-close patched-app-off patched-app-on patched-green
python3 native/wine-fullscreen/tests/run-diagnostics.py --work "$fixture_work" \
  baseline-resizable patched-resizable patched-fixed callbacks
```

Each case creates its own prefix, refuses to overwrite a previous case, drains
only that prefix's server and retains logs even on failure. Timeouts terminate
only the case's Wine server. The matrix returns nonzero if any case fails;
inspect every `result.log`, `native.log`/`*-native.log` and Windows log. The
diagnostic executable's own zero exit only means it completed its Win32 update;
the observer assertions determine success and the runner checks them.

The primary comparison keeps Retina off, green-button entry and a duplicate
pending request fixed. `baseline-off` and `patched-off` choose the same existing
resizable target; enabled cases choose the newly eligible fixed parent. The
baseline cannot exercise a fixed-parent fullscreen round trip it does not
support. Both retain every original 12-window geometry/style assertion.
`patched-on-repeat` uses another fresh prefix and identical conditions, rather
than changing Retina or toggle mode. Retina-on is a distinct coverage case.
`patched-green` is a separate variant that invokes the ordinary green button
for every entry and exit, retaining the original observer's assertions; the
historical comparison observer uses direct native toggles after its first entry.

The auxiliary-update diagnostic deliberately calls Win32 `SetWindowPos` on an
owned window while its parent occupies a verified fullscreen Space. It records
original, requested, observed-desired and final rectangles. The strict size and
frame assertions remain independent: position movement already seen with a
baseline resizable parent must not hide a new size reset with a fixed parent.
`baseline-resizable` and `patched-resizable` use identical fixture/window styles;
`patched-fixed` tests the new feature. This is separate from the earlier static
12-window displacement observation.

`callbacks` injects failed-entry/failed-exit notifications and changes eligibility
in the test process. It checks frame restoration, retry state, snapshot release
and repeated late closing callbacks. It does not prove a real OS-denied entry,
and does not replace the actual close-during-entry fixture. Other callback orders,
physical displays/OS versions and 32-bit execution need their own coverage before
being claimed. The recipes build i386 PE, but that alone does not validate WoW64.

No pointer, physical keyboard, performance, Game Mode, game or launcher-recovery
claim follows from these fixtures. See the assessment branch for measured results
and remaining submission blockers.
