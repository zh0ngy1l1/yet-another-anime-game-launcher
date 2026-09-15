# Step 8 delivery — 2026-09-15

Later same-day update: [Global installation and cleanup](global-installation-20260915.md)
records the subsequently authorized activation, startup correction and installed
app test. The artifact paths and activation status below describe the earlier
delivery; compact provenance was retained when the old build trees were removed.

Status: Step 8 is complete for the supported configuration below. Normal R2
delivery, fresh public-input builds and final isolated packaged qualification
passed. Working-installation activation remains optional and was not performed.
Dated earlier reports remain evidence for their own source and artifact identities.

## Source and build provenance

The verified starting HEAD was `7eb7e4abaedd8ec50deed316984a60bbc75d099a`.
The final application source is `7f18d097ea1c4d7463b3adc645e81099aeb1fb75`.
All preceding commits and the read-only legacy checkout were preserved.

The clean-checkout build uses tracked files, documented prerequisites and public
integrity-checked downloads. Its npm/uv/Python caches were initially empty; it had
no ignored native, bridge, Sophon, profile or installed-Wine inputs. Global and
China outputs are separate. The procedure is repeatable; different compilers,
SDKs or build paths can change compiled bytes. Generated identities are bound
into the package instead of replacing tracked reference hashes.

See [the one-command build instructions](build-macos.md) and
[FPS operation and recovery](fps-runtime.md).

## Corrections completed in this phase

- Enabled HK4E launches create a unique verified R2 runtime copy from the selected
  supported Wine, preserving the selected prefix, backend and environment. The
  copy is published only after inventory, delta hash and signature validation.
  Unsupported bytes fail before game mutation. Normal cleanup removes the copy
  only after owned completion, Wine waits and journal restoration.
- The multiline preparation recipe crosses the production command boundary as
  base64. File::Temp underscores are accepted consistently in selection/cleanup.
- Fresh setup verifies the pinned public Wine archive. Its eight dangling
  optional GStreamer links are handled by exact path/target inventory pins and
  quarantine removal on the links themselves (`xattr -drs`). Unknown or changed
  dangling links still fail preparation. HK4E setup preserves existing prefixes
  and does not request privileged host changes.
- Public builds compile the bridge, patched Neutralino and complete standalone
  Sophon. Required public notices and runtime/source recipes are tracked.
- xdelta now uses Apple's system liblzma ABI 6. The accidental Homebrew ABI 8
  dependency is removed. Uncompressed, DJW, FGK and LZMA round trips pass.
- Build-only environment paths are excluded from frontend settings. Finished
  package verification is part of the single build command.
- Default Wine diagnostics retain errors, loaded-module records and process IDs
  without the previous multi-gigabyte syscall trace. Explicit custom diagnostics
  remain respected.

A fresh-install attempt using source `02d8d79` failed while quarantine removal
followed the public archive's dangling links. It never launched the game. The
failure was retained, corrected and used as an isolated interrupted-setup case.
An intermediate custom-output package at `94aef4b` was rejected by verification
because Vite exposed its build-output path; it was not launched.

## Evidence accounting

Local evidence uses the root label **R** for the retained Step 8 delivery
workspace, identified in its `DELIVERY.json`. Private profiles, game files,
authorization records, process tokens, raw logs and screenshots stay outside the
public repository and application bundles.

The earlier 2026-09-14 R2 runs remain valid for their recorded artifacts:
enabled 60 stable login; enabled 120 gameplay approximately 117–118 FPS; enabled
150 ten minutes with ordinary movement and fast travel, approximately 110–121
FPS. All three recorded game exit 0 and completed cleanup. Their exact capture
qualifications remain in [the dated report](fps-r2-game-validation-20260914.md).
Requested caps and measured throughput are separate facts.

The new private runtime's journal paths do not exist at the initial game
preimage capture. Their preimages must therefore be established from the source
capture plus the complete preparation receipt committed before selection. The
coverage audit distinguishes these verified copy preimages from direct file
captures; it checks journal backup bytes against them. Source Wine, shared game
files and typed registry values are compared independently after cleanup.

## Support limits

Qualification is finite and specific to Apple Silicon macOS 26.6.2 with Rosetta,
HK4E Global, the exact pinned Wine/R2 bytes, DXMT 0.80.0, Steam Patch ON and Launch
Fix OFF. The bundle minimum is macOS 14; gameplay on earlier OS releases,
Intel-native/universal app builds, China gameplay, arbitrary Wine distributions
and higher graphics loads remain unrun. China is never pointed at the Global
executable. Option-integration tests do not establish real-game host-blocking
compatibility.

The outer app is unsigned and unnotarized; applicable native signatures are
verified. No paid signing, release publication, Native Fullscreen or Game Mode
work is included. R2 retains unchecked protection-call failures and independent
mapping/lifetime race limitations; finite gameplay is not universal crash-free
proof. The separate shutdown diagnostic is classified below.

## Final packaged qualification

Both final apps were built from a fresh checkout at the source commit above,
using `./build-macos.sh` (Global) and `YAAGL_CHANNEL_CLIENT=hk4ecn ./build-macos.sh`
(China). Global's empty-cache build completed on 2026-09-15 at 01:59:07 UTC.
Each finished bundle passed 531 file identities, architecture/deployment target,
permissions, applicable signatures, ASAR/frontend checks, complete 19-file
Sophon distribution, public resources/notices and four xdelta codec round trips.
Post-game rehashing and ZIP member verification matched every manifest entry.
The final native binary also passed real startup, persistence and normal quit.
Earlier hidden-startup fixtures remain separately identified below.

| Final package test                     | Actual observation                                                                                                                                                | Completion                                              |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Fresh setup/retry                      | Normal public archive download, hash, extraction, quarantine handling, wineboot and winecfg; no source Wine/prefix preseed                                        | Setup and app exit 0                                    |
| Fresh enabled 60                       | Normal launch prepared R2; first-run terms/prelogin at 60 FPS, 914 successful reads and one successful write/readback                                             | Game/app exit 0; full cleanup                           |
| Existing affected runtime, disabled    | Original ntdll retained, no R2 copy or FPS worker, login at 60 FPS; saved target 150 unchanged                                                                    | Independently retained game handle exit 0; full cleanup |
| Existing affected runtime, enabled 150 | Normal launch prepared R2; 794.6 seconds from observed world entry to normal close, including movement, unlocked-statue fast travel and graphics-menu transitions | Game/app exit 0; full cleanup                           |
| China                                  | Separate build and full bundle verification                                                                                                                       | Gameplay unrun; no China profile/game available         |

The enabled-150 world HUD samples were **120.00–129.93 FPS**. Map/menu samples
were separate (approximately 140–151 FPS). These are sampled throughput, not a
claim that every frame or requested 150 FPS was achieved. Settings were Windowed
1512×982, VSync OFF, render resolution 0.6, mostly Lowest, anti-aliasing OFF,
DXMT 0.80.0, Steam Patch ON, Launch Fix OFF, Timeout Fix ON and Metal HUD ON.
No Game Mode or Native Fullscreen change was made. The shared Global executable
was version 7.0.0, SHA-256
`a1a23cb76d941df28c5156ca3152fa49421ec98842221b7d71633d42ee76ca45`.
Fresh-game qualification stopped at the first-run terms screen; it did not accept
terms, log into a fresh account or enter its world. The existing-runtime case
used the established isolated account. Test setup imported the existing game
path into isolated preferences; the broad game-import integrity UI was not run.

Enabled-150 observed world entry was 02:18:35.383 UTC. At 02:25:53.085, changing
the game's FPS setting to 30 caused a successful four-byte write to 150 and the
next readback was 150. Restoring the original in-game setting to 60 at approximately
02:26:30 caused another successful write/readback to 150. All six writes and
5,024 reads succeeded; the sole final mapping change was during game exit.
Normal WM_CLOSE was posted at approximately 02:31:49.984. The retained game
handle reported exit 0 at 02:31:51.546; private cleanup completed at 02:32:01.434.

The external evidence-only close timer stopped at 02:20:46 on its strict
response-file consistency assertion, without running its helper. This did not
stop the game or the independent sampler/bridge records. After the original
600-second deadline, a fresh identity/creation/health-gated helper performed
ordinary close. Its elapsed-deadline handling was corrected outside the product;
no force-close or product workaround was used. The initial timer's failure and
successful later close are both retained. The fresh-60 run also retains a prior
read-only response-replacement race and its successful subsequent close. These
collector/helper limitations are distinct from game or launcher failures.

For both enabled runs, final records confirm game exit, worker completion,
empty game/Steam jobs, shim exit, released bridge state, supervisor status 0,
three completed Wine waits, journal restoration, private-copy deletion and guard
release. All 29 directly captured file paths and both typed registry values match.
All 28 enabled journal paths match their direct or receipt-derived preimages;
ten were verified private-copy preimages. The disabled journal covered 29 direct
paths. All Wine, game, bridge, Sophon and native app processes ended. Protected
working/baseline/candidate ntdll identities and `/etc/hosts` remained unchanged.
The legacy checkout retained its original unrelated modifications.

### Normal delivery provenance

Fresh and existing-runtime enabled launches each committed a **12,634-entry**
inventory before selection. Neither launch used the old candidate runtime.
The fresh receipt SHA-256 is
`6a69ecff7d3dcde5364540ae7aabcef916243d205129d60e49603336c5b0bb93`;
the upgrade receipt is
`0cbc5500df7bafac0820abe14a43dbadcb977207964c8423a4c46563196f11fb`.
Both selected ntdll SHA-256
`eef64f611ae9033261a70f46ec0be38d58823717f14e80331946c6d0cd3c85f7`.
Their source ntdll remained
`f26ade35f5b49e33b3780b6adc71f9eb9c831ea40222c1bae667ac14135d984b`.
The pinned public archive is
`4ebba536115e937c3826fa5808dbed50cd5e91c8454999b54cbe0cd2a43d8b4c`.
Exact loader/server, delta, source-patch and downstream provenance are in
[native/wine-r2](../native/wine-r2/README.md). No separately installed runtime
artifact or developer tools are required by the delivered application.

### Shutdown diagnostic classification

The final enabled-150 Wine stream records `virtual_setup_exception` nested
signal-stack exceptions at Wine tick 6495.737, on Windows PID **0x118 (280)**,
threads **0154 and 01b4**. That PID is the exact retained game, not a guessed
Wine helper. The lines occur after ordinary close and about **0.97 seconds before
recorded aggregate game exit 0**. Fresh enabled-60 similarly identifies the game
PID 280, three threads, about 0.87 seconds before its exit 0. The disabled control
contained no matching diagnostic. Older untagged evidence cannot retroactively
identify its emitter.

The corresponding `virtual_setup_exception` branch calls `abort_thread(1)`.
Wine's [thread implementation](https://raw.githubusercontent.com/wine-mirror/wine/wine-11.0/dlls/ntdll/unix/thread.c)
ends the calling thread, or exits the process if it was the last thread. This is
a real thread-abort diagnostic; restored files alone would not establish a
successful exit. Here the independent retained game handle, final worker/job
states, supervisor status, Wine waits and exact restoration establish completed
owned cleanup and a normal aggregate launch outcome. No gameplay crash or
unresolved owned-process/lifecycle defect was observed. The underlying teardown
thread exception remains an explicitly bounded runtime limitation, not a claim
of harmlessness or universal stability.

## Regression evidence

| Evidence class                     | Result / scope                                                                                                                                         |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Source tests                       | 2,049 Vitest tests in 28 files; type checks; lint with the same nine warnings and no errors; format checks                                             |
| R2 filesystem preparation          | 13 harmless real filesystem regressions plus full public-archive preparation and actual command-boundary coverage                                      |
| Validated collector                | 10 tests; direct/derived preimage auditing retained separately                                                                                         |
| Native bootstrap                   | Retry, unavailable, cancellation and watchdog fixtures passed on source-equivalent native build `02d8d79`; final native exercised in real startup/quit |
| Earlier native/bridge/offline Wine | Prior verified regressions and 8,003 offline Wine assertions reused for unchanged inputs; not labelled final-app gameplay                              |
| Other frontends                    | Seven unrelated channel builds passed after environment filtering                                                                                      |
| Clean package                      | Separate Global/China builds; 531 verified files each, 19 Sophon files, four xdelta codecs; ZIP bytes independently matched                            |

Local records include `PUBLIC-DELIVERY-*-BUILD.json`, `FINAL-PROTECTED-AUDIT.json`,
`checks/final-source-checks.log`, build/verification manifests and each run's
collector capture, request versions, runtime receipt, restoration and journal
coverage. Logs/screenshots were bounded; no new long video or huge trace was
created. About 160 GiB remained free after qualification; prior compressed
archives and backups were retained.

## Delivered artifact identities

Both apps contain native SHA-256
`a23476493114bc7b7cb24dca53543fb1b6d3d650f1927bb9cb408de571653d44`
and bridge SHA-256
`59ae7f9e1b753499386cfe5336c9f4a4d911c39c69ce3447712c4522ccbe7c95`.

| Identity                | Global                                                             | China                                                              |
| ----------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| Bundle manifest SHA-256 | `f3294c6f8feb183633e76bb79b8dc682e2bc078f89293d541ff3a77f11d40e9a` | `64541cdd2a0ebb42cb5bc0982d82c39c40feb86452d6a928cc0a7468c8b52ed1` |
| resources.neu SHA-256   | `e9252d927dadb73cc70921ea04b9c98ca3885f6599921caa8f7ee0b7f6ac59b2` | `a347a471b1b58b892f04b99861aae92440edde92a80c4b9bd9d143e41bf3f680` |
| Local ZIP SHA-256       | `6c5fd13f5b0462c846754e58f91e9459287acf640c2af7d3a80b390a2d580772` | `123f41986fec8d1241805fa596ea168331a5d55c0ad2f579ebbf886053ab66ef` |

The local apps are under `R/public-delivery-checkout/build/hk4eos/Yaagl OS.app`
and `R/public-delivery-checkout/build/hk4ecn/Yaagl OS.app`; ZIPs are under
`R/deliverables`. `R/DELIVERY.json` records absolute local paths, source/report
commits, hashes and publication outcome without putting private evidence into
Git. Follow [activation and rollback](build-macos.md#first-run-activation-and-rollback)
when choosing to use the prepared app. No further routine user testing is required.
