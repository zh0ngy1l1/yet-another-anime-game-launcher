# Build Yaagl OS.app

## Platform and prerequisites

The local delivery is qualified on Apple Silicon with macOS 26.6.2. The bundle
requires macOS 14 or newer for its hidden WebKit startup API; gameplay on older
macOS releases is untested. This build does not claim Intel-native, universal,
Linux or Windows application support. Wine, Sophon and several helpers are Intel
binaries, so Rosetta 2 must already be installed.

Install Xcode Command Line Tools, Git, npm, Python 3.13 (`python3.13`), `uv`, and
`x86_64-w64-mingw32-gcc` on PATH. The tested tools are Apple Clang 21.0.0,
MinGW GCC 16.2.0 and uv 0.12.10. Homebrew's `mingw-w64` provides the cross compiler.
No signing certificate or paid developer account is required. Allow roughly
10 GB for a clean build and its downloaded tool/runtime inputs, excluding game data.
Run from a native Apple Silicon terminal. `YAAGL_BUILD_PYTHON` may select another
explicit Python 3.13-or-newer executable.

The command selects **Node 16.20.2 and pnpm 7.33.7** itself. It installs the
JavaScript lockfile without updating it. Sophon uses its frozen uv lockfile and
managed Intel CPython 3.13.15; uv obtains that public interpreter with its
distribution integrity checks. Protocol compiler 31.1 and Neutralino source/client
downloads have explicit SHA-256 checks. Nuitka's optional ccache download is disabled.

## Clone and build

```sh
git clone https://github.com/zh0ngy1l1/yet-another-anime-game-launcher.git
cd yet-another-anime-game-launcher
./build-macos.sh
```

Global output: **`build/hk4eos/Yaagl OS.app`**. The build refuses to replace an
existing output directory. Use a new path to retain multiple local builds:

```sh
YAAGL_BUILD_OUTPUT="$HOME/yaagl-builds/global-next" ./build-macos.sh
```

China is a separate frontend and output, with its own default application state:

```sh
YAAGL_CHANNEL_CLIENT=hk4ecn ./build-macos.sh
```

China output: `build/hk4ecn/Yaagl OS.app`. Its game is `YuanShen.exe`; it must
never be tested with the Global executable. Both bundles retain the Yaagl OS
window title. Other channels retain their existing scripts.

The single build entry point builds the local bridge, patched Neutralino and
complete standalone Sophon, then packages the frontend, signed Steam pair,
runtime-preparation inputs, manifests, licenses and corresponding xdelta source.
It uses no installed launcher, profile, private evidence directory or Wine prefix.
No game or Wine process is started by building.

## Artifact identities and verification

```sh
npm exec --yes --package=node@16.20.2 --package=pnpm@7.33.7 --call \
  'node scripts/verify-macos-package.cjs build/hk4eos'
```

The output directory includes a complete bundle manifest; the bundle contains its
source commit, toolchain records, generated bridge identity, lockfile hashes,
Sophon inventory and ASAR member identities. A locally compiled bridge's hash is
generated into an ignored build module and bound into that build's frontend;
tracked reference hashes are not overwritten. Downloaded artifacts and the
signed Steam inputs retain strict fixed-hash verification.

This is a repeatable **build procedure**, not a claim that different compilers or
SDKs produce identical bytes. The native executable is ad-hoc signed. The outer
bundle is unsigned and unnotarized. No public release or notarization is performed.

The xdelta helper is built against Apple's system liblzma ABI 6. The previous
Homebrew-only ABI 8 dependency is removed. Its recipe, pinned source archive,
headers and licenses are in `native/xdelta` and `scripts/build-xdelta.py`. Codec
verification covers uncompressed, DJW, FGK and LZMA secondary compression.

## First run, activation and rollback

The app's default state is `~/Library/Application Support/Yaagl OS R2` (Global)
or `~/Library/Application Support/Yaagl China R2` (China). These distinct defaults
avoid replacing an existing working profile. Copy the already built app to a
separate location such as `~/Applications/Yaagl OS R2.app` when ready to activate.
Keep the previous app and profile for rollback.

Normal setup obtains the pinned Wine 11.0 signed-with-patches archive. Steam Patch
starts ON for a new profile; Launch Fix starts OFF. Enabling FPS unlocking causes
the launcher to prepare and select R2 automatically at Launch. No Library file
edits, manual ntdll copy, developer tools or source checkout are needed to run it.
Existing settings are preserved. See [FPS operation and recovery](fps-runtime.md).

Rollback is normal quit, wait for cleanup, then reopen the retained previous app
with its own profile. Keep game data, saves and prefixes. Do not copy a running
prefix, reset Wine, or delete a retained request/journal to bypass a guard.

Current [runtime validation](genshin-runtime-validation-20260922.md) and
[shutdown classification](fps-normal-exit-race-20260923.md) record the finite
live results. CI builds on Apple Silicon and runs source/artifact checks;
it does not launch the game or change hosts.
