# HK4E Game Mode loader and native child routing

The fixed `YAAGL HK4E.app` is the actual Wine game process, not a forwarding
parent. Its stable identity is `com.zh0ngy1l1.yaagl.hk4e-game`. External and
embedded plists match, declare the games category and `LSSupportsGameMode`, and
omit `LSUIElement`. These metadata request eligibility, not observed activation.

`loader.c` and `main.h` derive from upstream Wine 11.0
`db11d0fe6a169c457e23d007e20404643d067aa8`, under LGPL-2.1-or-later. Original
copyright and license notices remain in the files; the complete license is
included here. Upstream `loader/main.c` SHA-256 is
`ab7df8fbca3308fba27b7f3e081526ca772ec81b39733d1b16f4374ef720e857` and
`loader/main.h` is
`ed0a9f8950a71d30ff70b1e0bf1d6cc2b32ab267b77833ebe4843e8eaaebe1bf`.
YAAGL's modifications are the fixed macOS configuration and the call into
`routing.h`; address reservations, exported preload information, and ntdll entry
remain upstream's loader. This is an x86_64/Rosetta component with a macOS 14
deployment target, not a new Wine distribution or universal hardware claim.

Reviewed architectural references:

- [Legacy YAAGL](https://github.com/zh0ngy1l1/yaagl-fpsunlock-gamemode-legacy/tree/d48bd81bfcd64b337c92d2b53d0dacc3321a9b41/wine-patches/game-mode): small Wine-compatible signed loader, adjacent real app, pre-initialization `execv`, context preservation and no forwarding lifetime.
- [ForgePlay](https://github.com/Facta-Leopard/ForgePlay/tree/b7f334f84a5e0c980f026a832269aa6080326b4a/Native/GameModeProcessHost): actual process identity, exact runtime binding, resolved executable selection and separation of capability/fullscreen/OS activation.

No ForgePlay source, host, patch, App Group, provisioning, classifier, lease or
telemetry code is incorporated. Its GPL-3.0-only Game Mode scope was reviewed;
these additions implement the ideas independently against Wine 11.0 and retain
Wine's LGPL license. The launcher's MIT license is unchanged.

## Why a narrow ntdll change is necessary

In this Wine version, `NtCreateUserProcess` opens the resolved executable through
`get_pe_file_info`, but `spawn_process` builds the loader argv from the separately
supplied command line. A loader-only argv classifier cannot distinguish
`CreateProcess(real_game, helper_looking_command_line)` from the reverse.
`WINELOADER` on an outer helper does not control all native child creation:
`init_paths` derives the inner loader from ntdll's own location.

`resolved-image.patch` passes that existing resolved Unix name into the existing
spawn function and overwrites one Unix environment value in each forked child.
No new Wine ABI/export, PE DLL, server protocol, job, supervisor, process owner,
driver or graphics policy is introduced. Builtins with no Unix file get an empty
value. The loader consumes the value before entering ntdll; Windows children
cannot assert it with command-line text or a Windows environment block.

Preparation adds the assets to the same unique APFS runtime used for fullscreen
and FPS. A 0600 request binds its fixed relative location, canonical prefix,
canonical executable and device/inode, and exact ntdll digest. It is private
launch data outside the sealed bundle, not a per-launch plist or signature.
The matching child must also have Wine's inherited server socket and
`WINELOADERNOEXEC`. The ordinary loader execs the fixed host before initialization,
preserving **argv[0] too**, the PID, cwd, environment, descriptors and Wine server
context. The host verifies only the associated ntdll (roughly 600 KB) at startup,
then enters `__wine_main` in that PID. It has no library search fallback.

The environment contract is launch admission, not a sandbox against the current
user. The launcher and its existing ownership guard remain authoritative. Setup,
registry, wineboot, signed Steam, FPS bridge/worker and unrelated resolved images
stay on the ordinary loader. Recreating the same selected executable is still
within the same owned Wine lifetime. Direct and Steam routes both create the game
as a Windows child, with and without FPS.

## Identities and build

`manifest.json` pins source/build inputs and every signed asset. The two new
ntdll outputs are distinct identities: routing only (`ntdll.so`) and routing plus
the exact reviewed R2 source correction (`ntdll-r2.so`). The rebuild verifies the
R2 helper against the existing provenance hash. Neither is represented as the old
`eef64f…` binary. Fullscreen native/PE driver bytes are unchanged.

The build explicitly removes `virtual.o` and its linked ntdll after applying R2.
macOS's make 3.81 can otherwise reuse the plain object when both source changes
occur within one second. Package verification rejects identical plain/R2 text
sections; the real-Wine fixture checks that an external write to currently
WRITECOPY image data does not temporarily remove read access. Source hashes and
distinct signatures alone cannot establish that the correction was compiled.

Game Mode off adds no assets/routing and retains the accepted original or R2
runtime identities. Normal `./build-macos.sh` verifies and packages tracked
assets, sources, license and recipes; no Wine compilation or paid signing is
needed by users or a clean app build.

Developer rebuild (same prerequisites as the fullscreen developer recipe):

```sh
python3 scripts/build-game-mode.py --work /absolute/new/build-directory --record
python3 scripts/verify-game-mode-assets.py
```

Use a fresh work directory. The build acquires the public pinned Wine 11.0 archive,
the complete matching MacPorts overlay, public runtime dependencies and headers
through the checked-in fullscreen source recipe. Only native ntdll and the small
loaders are compiled. `--record` deliberately replaces tracked assets/manifests
after source review; normal builds never invoke it. Ad-hoc signatures, x86_64
architecture, ntdll exports, preload reservations, dependencies and both plists
are checked. Bit-identical builds across compilers/SDKs are not claimed.

Focused developer checks:

```sh
python3 scripts/test-game-mode-loader.py
python3 scripts/test-fullscreen-preparation.py --runtime /absolute/pinned/wine
python3 scripts/test-game-mode-wine.py --runtime /absolute/pinned/wine
```

The entry probe and small Windows executables are disposable fixtures, never
injected into the game. They distinguish resolved images from command lines,
check effective Foundation bundle identity, PID, argv, cwd, inherited native and
Windows handles, failures, normal completion and disposal. They are not Game Mode
activation evidence or benchmarks.
