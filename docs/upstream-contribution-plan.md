# Native fullscreen and Game Mode contribution plan

This is a proposal for separate upstream contributions, based on the current
implementation. Passing synchronization checks does not establish upstream
readiness or qualify gameplay with the upgraded DXMT component. See the
[build procedure](build-macos.md), [fullscreen contract](native-fullscreen.md),
[Game Mode contract](game-mode.md) and their linked historical validation reports.

## Current boundaries

| Boundary                  | Files and responsibilities                                                                                                                                                                                                                                                                                                  |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Preferences and admission | `src/clients/mhy/hk4e/config/{native-fullscreen,game-mode}.tsx`, `game-mode.ts`, and `settings.tsx`: independent default-off preferences, supported host/runtime checks, settings UI. Game Mode requires the fullscreen preference; neither enables FPS.                                                                    |
| Launch composition        | `src/clients/mhy/hk4e/program-launch-game.ts`, `prepare-r2.ts`, `prepare-r2.pl`: prepare one verified private runtime, compose optional driver/routing/R2 assets, select it for the request, and dispose it after cleanup.                                                                                                  |
| Window state and recovery | `window-session.ts`, `window-state.ts`, `native/window-state/`: independently built registry helper, immutable raw preimages, per-server windowed size, explicit-resolution precedence, and durable startup recovery. HK4E `index.tsx` invokes recovery; `src/launcher/startup-recovery.ts` guards startup admission.       |
| Wine fullscreen           | `native/wine-fullscreen/allow-fixed-size-fullscreen.patch`, manifest, source recipe and tests: opt-in `AllowFixedSizeFullscreen`, ordinary AppKit green-button transitions, fixed-window restoration and attributed Unity-window geometry observations. Matched Mach-O/PE driver assets live in `sidecar/wine-fullscreen/`. |
| Wine Game Mode            | `native/wine-game-mode/{loader.c,routing.h,resolved-image.patch,Info.plist}`, manifest and `sidecar/wine-game-mode/`: resolved-child routing, fixed actual-game app identity, ordinary and R2 ntdll variants. The app host is the game process, not a forwarding supervisor.                                                |
| Distribution              | `scripts/build-{fullscreen-driver,window-state,game-mode}.py`, `scripts/verify-{fullscreen,game-mode}-assets.py`, `scripts/build-macos.cjs`, `scripts/verify-macos-package.cjs`: asset provenance, signatures, source/license inclusion and frontend-to-bundle identity checks.                                             |

## Required dependencies and removable coupling

**Both features already work independently of FPS unlocking in the implementation.**
`ownedLaunchGameProgram` prepares fullscreen with `fps: false`, then uses the
ordinary launch route. Fullscreen alone retains the original ntdll; adding Game
Mode selects its routing-only ntdll. Only an admitted FPS launch selects the R2
correction and FPS bridge/worker. The registry helper does not depend on that
worker. Preserve all combinations during extraction, including direct and signed
Steam-child launch routes.

The exact Wine input, compatible native assets, private-runtime lifetime, safe
window registry restoration and ownership-based cleanup are real dependencies.
Game Mode additionally needs Apple Silicon/macOS 14+, native fullscreen and the
actual selected game process to have the eligible app identity. Its resolved-image
ntdll patch prevents command-line text from misclassifying a helper as the game;
setting the launcher's plist or only `WINELOADER` cannot replace that routing.
macOS decides activation independently of the saved preference and admission.

The `prepareR2Wine` name, `fps-runtime` directory, and `window-session.ts` imports
from `fps-artifact.ts` are incidental coupling. For upstream extraction, put the
existing verified asset staging/private-runtime composition behind a small
neutral interface; retain the same identity and completion checks. R2 byte pins
currently also identify the qualified input even when R2 is not applied. Separate
input capability records from the optional R2 transform without accepting
unverified runtimes. Do not require the entire FPS implementation, Sophon updater,
custom bootstrap or replacement build system merely to add fullscreen.

Window memory currently runs with fullscreen/FPS off as well. Preserve that
behavior in this fork, but make its broader upstream behavior change a separate
reviewable decision. Same-session fullscreen frame restoration remains necessary;
across-launch size persistence can be a later launcher PR. Keep any temporary
registry mutations journaled and recoverable even in the smaller contribution.

## Companion repositories and proposed PR order

The native recipes pin Wine `db11d0fe6a169c457e23d007e20404643d067aa8`
(11.0), the `riverfog7/macports-wine` overlay
`0d029255bce8f2f4ac47a1984b59ba82e09d9829`, and the public runtime from
`yaagl/anime-game-wine`. Existing tracked assets make the current implementation
self-contained; no unpublished companion release is required to build it.
For a maintained upstream distribution, agree who builds and ships these native
changes before exposing the settings:

1. **Runtime fullscreen contribution.** Submit the generic fixed-size AppKit
   eligibility/transition/restore change with native fixtures to the maintained
   Wine overlay, with a separate Wine contribution if accepted there. Keep
   HK4E executable names and launcher-specific geometry transport out of a generic
   Wine patch; retain that adapter in the downstream overlay if still needed.
   `yaagl/anime-game-wine` needs matching build/release changes if the chosen
   distribution model ships these modules in its runtime instead of launcher
   sidecars. Record exact supported inputs and outputs either way.
2. **YAAGL fullscreen PR.** Add the default-off HK4E preference, runtime capability
   admission, minimal verified composition adapter, temporary windowed-mode/
   driver registry transaction, completion/recovery integration and package
   checks. Include green-button entry/exit and close-during-transition fixtures.
   Preserve other clients, runtime choices and build channels. Follow separately
   with cross-launch window memory if upstream accepts that broader policy.
3. **Runtime Game Mode contribution.** Review the resolved-image child-routing
   patch and fixed loader/app host independently of fullscreen and FPS logic.
   Supply sources, LGPL notices, plain routing ntdll and lifecycle/identity tests
   in the selected overlay/distribution workflow. The R2 variant is needed only
   for the fork's optional FPS composition, not the base upstream feature.
4. **YAAGL Game Mode PR.** After the runtime contract and fullscreen prerequisite
   exist, add the separate default-off preference, host/runtime admission,
   request binding, host assets and verification. Keep setup, Steam and helpers
   on ordinary identities. Test direct/Steam routes with FPS off; this fork must
   additionally retain FPS-on coverage. Do not claim activation from metadata.

No companion change to DXMT is required by these fullscreen/Game Mode patches.
DXMT remains a separately distributed graphics component whose version must be
qualified with the composed runtime. The fork's optional Neutralino bootstrap
and clipboard patches are not prerequisites for a native game-window feature;
carry only any concrete launcher lifecycle adapter needed by the chosen design.

## Remaining acceptance and maintenance work

- Current admission is restricted to Wine `11.0-dxmt-signed-with-patches` with
  DXMT, exact native identities and APFS private copies. The app is Apple Silicon
  with x86_64 Wine/helpers through Rosetta. Supporting other Wine releases,
  backends, filesystems or game clients needs separately verified capabilities;
  retaining their ordinary upstream launch paths does not qualify these features.
- Existing live evidence is finite Global testing on macOS 26.6.2. Extend coverage
  to supported macOS versions, CN, multiple displays/Retina, repeated transitions,
  interruptions, normal/abnormal exit and relaunch. A locked console can produce
  callbacks without a fullscreen Space. Native fixtures need an unlocked desktop;
  test-only Space observers must remain outside the product game path.
- Recheck Game Mode in the OS Game menu/overlay during real gameplay. No performance
  gain, long-session stability or compatibility with the new DXMT follows from
  old gameplay evidence, unit tests or successful packaging.
- Decide an upstream-owned stable bundle identifier: the host currently uses
  `com.zh0ngy1l1.yaagl.hk4e-game`. Changing it can affect macOS's remembered game
  preference. Decide signing/notarization, source/license delivery and native
  artifact ownership. Current native assets are ad-hoc signed, the outer app is
  unsigned/unnotarized, and builds are not promised byte-reproducible across SDKs.
- Require source/asset/frontend/package consistency whenever Wine or the overlay
  advances, including matching driver architectures and distinct plain/R2 text.
  The publisher lacks a complete build manifest: matching source/version and
  pinned bytes are not proof of a bit-identical publisher rebuild.

## Intentional fork differences relevant to later merges

This synchronization retains owned HK4E FPS supervision, R2 preparation, private
runtime composition, registry/file journals, safe cleanup/recovery, window memory,
Sophon recovery work, native clipboard/bootstrap behavior and the macOS build
pipeline. They must be reviewed as separate boundaries when upstream launch or
packaging code changes; a whole-file upstream/fork choice is unsafe. HK4E's
deferred ReShade configuration remains inside its launch transaction, while
default resource preparation keeps upstream callers' behavior.

Fullscreen/Game Mode remain default-off, windowed-first and HK4E-specific; there
is no automatic fullscreen entry, runtime switching or Command/Option remapping.
Preserve the running/cleanup status contract and separate ordinary progress from
errors. Custom bundled-native builds require complete application replacement;
resource-only self-update is disabled for them, including versioned builds. Stock
client builds retain the inherited `3shain` release endpoint and update behavior.
Any future automated fork updater must preserve matching native sidecars/manifests.
Controller support remains outside these proposed contributions.
