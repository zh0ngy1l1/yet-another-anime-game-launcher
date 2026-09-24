# HK4E Game Mode implementation and brief functional validation

Validated September 23, 2026 (America/Toronto), on Apple M4 / macOS 26.6.2
(`25G83`), using Global, Steam Patch, DXMT and
`11.0-dxmt-signed-with-patches`. This qualifies that configuration only.

## Branch and candidate

The fetched accepted `main` was
`516830e2d7e9def2e4d642dc0b39d5b4c1aef304`. Implementation is local on
`feat/hk4e-game-mode`:

- `f1a68d2`: pinned Wine 11.0 Game Mode loader, resolved child routing, native
  assets, provenance, rebuild recipe and focused native fixtures.
- `110c07a`: separate default-off setting, runtime composition, launch admission,
  localization, package verification and integration tests.

The candidate was built from clean implementation commit
`110c07a429ba85a85647e5153e8014340dba8aef`; this report is a subsequent
documentation-only change. Build command:

```sh
YAAGL_BUILD_OUTPUT=build/game-mode-candidate-global ./build-macos.sh
```

Output: `build/game-mode-candidate-global/Yaagl OS.app`. Its build receipt is
`Contents/Resources/manifests/build.json`. Main was not advanced, nothing was
merged or pushed, and the production application was not replaced.

## Design and native identities

The implementation takes the legacy reference's small Wine-compatible loader,
fixed signed app and same-PID pre-initialization `execv`, and ForgePlay's emphasis
on the actual game process, resolved executable identity and exact runtime
binding. It independently adapts the pinned upstream Wine 11.0 loader under its
existing LGPL license; no ForgePlay source is incorporated.

Wine's child argv can differ from the resolved executable, and its inner loader
selection does not follow an outer `WINELOADER` setting. The narrow ntdll patch
therefore passes the already-resolved image to the loader. A private request
binds the game path/inode, prefix and selected ntdll. Only the selected game
execs `YAAGL HK4E.app`, with stable identifier
`com.zh0ngy1l1.yaagl.hk4e-game`, then enters that exact ntdll in the same PID.
Wine initialization, reservations, argv including argv[0], inherited handles and
existing launch ownership are retained. Helpers keep ordinary identities.

Everything composes in the existing single private APFS runtime. There is no
extra runtime copy, runtime compilation/signing, forwarding process, observer or
per-frame integration. The host hashes its associated ntdll once at startup.
The fullscreen driver is unchanged; Game Mode off retains the accepted original
or R2 ntdll bytes. These are architectural properties, not measured performance
claims.

New signed assets are tracked under `sidecar/wine-game-mode`. SHA-256 identities:

| Asset | SHA-256 |
| --- | --- |
| Game Mode ntdll, FPS off | `af8d94f3d9b51bb9e20e635e17e785f7cb512128f5adc5065c30aa1c599014d5` |
| Game Mode + R2 ntdll, FPS on | `6daf44d0f65d69e752bb3acfd2adeb7d313826829daade9eef6ec61490f96a7a` |
| Ordinary inner loader | `8f8e629353e72462eb69e9dc6ff7791f39e51023a00c88f555b6673290e45ffe` |
| App-host loader | `b5019ca171e295d44a947f06de904a37cb21d5c8c36aefee8808ce50f93606a3` |
| Unchanged accepted R2 ntdll, Game Mode off | `eef64f611ae9033261a70f46ec0be38d58823717f14e80331946c6d0cd3c85f7` |
| Unchanged accepted fullscreen native driver | `9a2492653c84e3a57dafc2e6862f11f1cd5985d978d3140615ab039ab95fc060` |

The [native manifest](../native/wine-game-mode/manifest.json) pins all source,
signature and asset identities. The [native README](../native/wine-game-mode/README.md)
records references, licensing, the routing contract and public-source rebuild
instructions. Clean app builds use tracked assets without a legacy checkout,
unpublished dependency, paid signing identity or end-user Wine compilation.

## Focused verification

- TypeScript passed; ESLint had zero errors and nine existing warnings. Formatting
  passed. The existing unit suite passed all 2,134 tests in 35 files, including
  settings/admission, preparation and 32 launch-construction combinations across
  Game Mode, FPS, fullscreen, direct/Steam and Global/China.
- The existing preparation fixture passed 16 cases: accepted off combinations,
  Game Mode/FPS composition for both regions, request binding, and rejection of
  incompatible/missing drivers, hosts, runtime loaders, prefixes and targets
  before copying. Installed runtime bytes remained unchanged.
- The native entry fixture verified same PID, argv[0]/arguments including empty
  and Unicode values, cwd, environment, inherited descriptor, preload export and
  effective Foundation bundle identity. Helpers stayed unbundled; missing host,
  ntdll mismatch, wrong request runtime/prefix and changed target inode failed.
- Real Wine fixtures using both shipped ntdll variants verified that resolved
  executable identity beats a misleading command line in both directions, with
  Global/China names, inherited Windows handle, arguments, environment, cwd,
  exit status 37 and ordinary Wine completion/disposal. Wineboot stayed ordinary.
- Native/package checks passed hashes, x86_64 architecture, ad-hoc signatures,
  dependencies, matching embedded/external plists, reservations and exports.
  The new ntdll variants have the same exported symbol set as the accepted
  runtime. Full candidate verification covered 554 files and four xdelta codec
  round trips. The China frontend also built successfully.

## One brief Global/Steam session

The candidate ran through the existing guarded disposable route, using fresh
APFS copies of the previously validated profile and game. The only changed saved
`config_*` value was Game Mode=true. FPS target 150, Retina off, resolution
intent, DXMT and the other existing choices were retained.

Before any game launch, an initial launcher-only attempt exposed stale loose
frontend files inherited by the disposable profile. The guard uses
`--load-dir-res`; the harness was corrected to unpack the candidate's
`resources.neu`, and every unpacked member was checked against its packaged
manifest. That launcher was closed normally. There was only one real-game
session, using the corrected candidate resources.

Observed in that session:

- Actual native game PID 91789 (Windows game PID 280), owning the Genshin Impact
  window, had the intended bundle identifier and executable inside the private
  `YAAGL HK4E.app`. Native executable-path inspection, NSRunningApplication and
  window ownership agreed. Mapped ntdll and winemac paths belonged to the same
  selected private runtime; their hashes matched Game Mode + R2 and the unchanged
  fullscreen driver above. Steam and FPS bridge processes used ordinary loaders.
- The game launched windowed. The existing green fullscreen button entered the
  native Space. The macOS Game Overlay's Settings explicitly showed **Game Mode,
  On**, confirmed by screenshot and accessibility text. No OS Game Mode toggle
  was changed, and no private OS controls or preference rewrites were used.
- The saved account reached the world and the game responded to brief UI/input
  checks. The existing FPS worker wrote and read back target 150. This is target
  operation evidence, not a measured rendering rate.
- Leaving fullscreen once restored the same window at `(116,72)`, outer size
  `1280x832`, with remembered client size `1280x800` and Retina off.
- Actual interaction after loading lasted about 99 seconds, from 23:21:43 to
  23:23:23. An initial synthetic quit shortcut had no observed effect; the game
  remained idle during exit automation. The normal native close button ended
  the game at 23:27:18 with exit code 0. No force quit or termination signal was
  used, and there was no additional gameplay or comparison session.
- Existing ownership checks confirmed foreground completion, Wine completion
  and registry restoration. File restoration and private cleanup completed at
  23:27:33. The private runtime, FPS request, window journal, pending window
  controls and Steam patch marker were gone. Saved window memory remained
  `1280x800`. No owned native executable remained. The launcher then quit normally
  with code 0.

The first-run local-network permission dialog for the new host was answered
**Don't Allow** through normal macOS UI. That permission choice is separate from
Game Mode; internet/world access still worked. The smoke test did not change
macOS's remembered Game Mode choice.

The guard confirmed the original game inventory unchanged. Independent before/
after inventories also matched for the production app, production profile and
source disposable profile. Source Wine loader, wineserver, ntdll and driver
hashes were unchanged. The guard denied original-game reads/writes and writes to
the production and prior validation locations throughout the session.

Local evidence is retained under
`/private/var/folders/nn/34wh2q094x5f5qrtj4n8c76r0000gn/T/yaagl-game-mode-live-zeiaujjk`,
including `candidate-smoke/launch-process.json`,
`candidate-smoke/launcher-console.sanitized.log`, `smoke-observations.json`,
`loaded-runtime.json` and `cleanup-verification.json`. Build/fixture logs and
private screenshots are ignored under `.tmp/game-mode-*`; account screenshots
are not committed.

China real gameplay, a full China app package, direct real gameplay, FPS-disabled
real gameplay, other hardware/OS versions and long sessions were not run. Those
launch constructions and native compositions have fixture coverage, not claimed
live qualification. No relaunch was added to repeat the already accepted window
memory investigation.

## Use and stopping point

Enable **Native macOS fullscreen** and the separate **Game Mode** option in Game
settings, then launch and use the green button. Check the game's normal macOS
Game menu/Overlay for observed activation. If fullscreen support is off, the
saved Game Mode choice remains inactive. Unsupported host/runtime combinations
explain the limitation without switching runtimes. Disable **Game Mode** and
relaunch to return to the accepted ordinary route. Changes apply to the next
launch and do not edit a running session. See [user instructions](game-mode.md).

**A/B testing not performed; performance benefit unmeasured; branch awaiting the
next authorized A/B stage and later explicit merge authorization.**

No comparative FPS sampling, benchmarks, speedup conclusions, merge, push,
publication or production replacement was performed.
