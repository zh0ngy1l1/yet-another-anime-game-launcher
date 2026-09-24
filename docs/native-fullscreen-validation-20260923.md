# Native macOS fullscreen validation — 2026-09-23

Work began on clean `main` at `6cc27b3e6fdd4a07f7645a0102da1f2822cdccda`
in the checkout identified by the active fork's Git remote. The older research
pin was not checked out or reset. Implementation and asset commits are
`f033cf6`, `1dece8a`, `b9446c6`, and `b24cbd3`. Nothing was pushed or published.
The last implementation commit adds a closing-transition fix. The first three
real-game runs below used `1dece8a`; later checks use the final pinned assets.

## Delivered behavior and provenance

- HK4E-only **Native macOS fullscreen** defaults off. It enables the actual
  native green button; it does not enter fullscreen automatically.
- When either feature is enabled, one private runtime composes the requested
  features without changing installed Wine. FPS-only uses the existing R2 copy; fullscreen-only retains
  the original ntdll; both use one copy with R2 and the matched driver trio.
  In the neither-enabled case, ordinary launch uses the installed runtime as
  before, with the new narrow window-memory transaction.
- Only the actual game's AppDefaults option and required Unity window values
  are temporarily changed. Raw absent/type/data preimages and newly created empty
  ancestors are restored, preserving unrelated values. Saved/apply/restored phases
  prevent retry from recapturing an override or discarding a missing preimage.
- Window memory survives temporary registry rollback. New explicit launcher
  resolution edits win over an earlier session; subsequent observed in-game
  sizes win over unchanged defaults. Custom resolution off still uses valid
  memory. With neither memory nor custom resolution, no default size is imposed.
- Optional prior-fullscreen restoration is omitted. Launches with support enabled
  reopen windowed at the saved size. No entry automation or Game Mode host was added.

The driver is Wine 11.0 `db11d0fe6a169c457e23d007e20404643d067aa8`, the complete
MacPorts overlay at `0d029255bce8f2f4ac47a1984b59ba82e09d9829`, and the reviewed
adaptation of the legacy pinned patch. Native x86_64 and PE x86_64/i386 modules
were built together. Final native SHA-256:
`9a2492653c84e3a57dafc2e6862f11f1cd5985d978d3140615ab039ab95fc060`.
The two PE outputs remain unchanged by the final Cocoa-only correction.
The helper's final SHA-256 is
`af558ae0b5f1bcb0110c090c89ea0e8838a454df0265d99aa0c41280628aeb4a`.
Manifests pin all inputs/outputs, source, patch, architectures and toolchain;
strict native signature and dependency checks pass. Publisher bit-identical
reproduction is not claimed.

The tracked trio/helper are packaged by `./build-macos.sh`. A fresh checkout of
these commits needs no legacy checkout or unpublished asset, and end users do not
compile Wine. Native developer recipes download public pinned inputs and rebuild
only the required components. No artifact publication remains necessary. See
[asset build/provenance](../native/wine-fullscreen/README.md) and
[operator instructions](native-fullscreen.md).

## Automated and native results

| Check                               | Result                                                                                                                                                                               |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| TypeScript suite                    | 2,110 tests in 33 files pass, including existing normal-exit/error-87 behavior                                                                                                       |
| Typecheck, lint, format             | Pass; zero lint errors, nine pre-existing warnings                                                                                                                                   |
| Launch construction                 | All 16 FPS/fullscreen × Global/China × direct/Steam combinations pass                                                                                                                |
| Fullscreen runtime preparation      | Seven cases pass: four compositions and rejection of each incompatible driver input before copying                                                                                   |
| Existing R2 preparation regressions | 13 pass; source bytes/inventory retained, failed/abandoned copies not admitted                                                                                                       |
| Actual Wine registry helper         | 12 cases pass: both servers, absent/binary/DWORD/expand-string preimages, retries, partial setup, unrelated values, missing snapshots, work-area clamping versus explicit dimensions |
| Window state/session                | 30 tests cover precedence, no imposed defaults, missing/corrupt state, crash/cancel retention, recovery phase markers, server binding and Retina conversion policy                   |
| Native FPS portable checks          | Production lifecycle and diagnostics pass; all four fault mutants rejected                                                                                                           |
| Final assets                        | Hashes, reviewed source/patch, dependencies and ad-hoc signature pass                                                                                                                |

Before the console locked, native fixtures passed with opt-in absent, N and Y,
and both opposing global/AppDefaults values. The enabled runs verified actual Cocoa Space
entry, repeated entry/exit, fixed/resizable/constrained windows, excluded owned,
child, popup, dialog, tool and nonactivating windows, all 12 final geometries and
Win32 styles, and fixed client restoration to `480×300`. A separate standard
**green-button** run passed. The shipped x86_64 native module was exercised with
both x86_64 PE and i386 PE/WoW64 fixtures. These runs used the initial driver trio.

Later close-during-entry coverage exposed late AppKit callbacks redisplaying a
Win32-destroyed window. The final patch skips frame restoration for closing
windows, releases saved child frames/pending work and orders the Cocoa window
out. After unlocking the console, the **final pinned trio passed** the complete
x86_64 and i386/WoW64 green-button fixture again: actual type-4 Spaces, repeated
entry/exit, unchanged styles/constraints, all 12 restored geometries, a duplicate
toggle while entry was pending, and delayed verification of no automatic reentry.
The final close-during-entry case also passed: Win32 destruction, invisible Cocoa
window, cleared pending flags/no fullscreen Space, and other fixture windows
remaining usable. Attempts made while the console was locked are excluded from
these successful interactive results.

Both final packages were built with the documented entry point from
`b24cbd304ad156240444177c80a6399ff1c7cf35`:

- Global: `build/fullscreen-release-global/Yaagl OS.app`.
- China: `build/fullscreen-release-china/Yaagl OS.app`.

The subsequent completion commit changes documentation/evidence only; package
implementation and pinned assets remain those of `b24cbd3`. Each package passed
its 536-file inventory, bundled/frontend asset hashes,
source/manifest correspondence, native dependencies/signatures and four xdelta
codec round trips. No production installation was replaced.

## Observed Genshin results

The existing guarded route ran a packaged Global app against separate APFS copies
of the validation profile and game. Seatbelt protected the active installation,
original profile, and source validation data. Existing account/session state was
reused; no credential or agreement automation was added. Original inventory checks
passed after every guarded launch. The clone's source Wine loader, server, ntdll
and driver hashes remained unchanged; normal game completion removed every
private runtime and pending window record. The final launcher closed with exit
zero; its guard receipt confirmed the original inventory was unchanged, and no
owned Wine processes remained.

All game runs used Global **Steam Patch ON**, DXMT 0.80, the same panel,
and **Retina OFF**. HDR and Launch Fix stayed off. FPS-enabled runs retained the existing target 150; disabled runs used the
existing 60 FPS DXMT path. No product observer was injected. Read-only Win32/Space probes
and PID-specific UI interaction were validation tools only.

| Run                                                                   | Observed behavior                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FPS on, fullscreen support on, custom resolution on                   | An initial `1152×648` request was adjusted by the game to `1024×768`. The actual Unity window was titled and fixed (`style=14ca0000`, `ex=00000100`). The green button entered a type-4 fullscreen Space; leaving restored the exact `1024×768` client and original frame position. Normal windowed quit reported game exit code zero and retained that size after cleanup.                                                                                                                         |
| FPS on, fullscreen support on, newer explicit custom choice           | Changing the stored launcher choice/revision to `1280×720` beat the previous memory. The game opened windowed at that size, entered a real fullscreen Space, then quit normally **while fullscreen**. Cleanup retained `1280×720`, not fullscreen dimensions.                                                                                                                                                                                                                                       |
| FPS off, fullscreen support on, custom resolution off                 | The next game opened **windowed at remembered `1280×720`**. The private runtime's ntdll was the original `f26ade…`, and no FPS worker ran. The green button entered a genuine fullscreen Space; exit restored the original frame. Normal windowed quit preserved `1280×720` and completed all cleanup.                                                                                                                                                                                              |
| Final package: FPS off, fullscreen support off, custom resolution off | Reopened windowed at `1280×720` using the unmodified source runtime, with no private runtime or worker. The fixed window's green fullscreen button was disabled. A normal windowed quit retained `1280×720`; the final helper restored the registry and removed the pending record.                                                                                                                                                                                                                 |
| Final package: FPS on, fullscreen support on, custom resolution off   | Enabling both checkboxes only saved preferences; no runtime appeared until launch. The private copy contained exact R2 `eef64f…` and final driver `9a2492…`. Loaded the world, repeatedly entered/exited genuine fullscreen Spaces and restored `1280×720`, switched away/returned, then selected `1280×800 Windowed` in-game. Quit from fullscreen with Option+Command+Q; bridge recorded exit zero and classified a concurrent error-87 read as process termination. Cleanup retained `1280×800`. |
| Final package: unchanged custom-off relaunch                          | Reopened **windowed at `1280×800`**, then quit windowed with Option+Command+Q. Bridge exit zero, exact rollback and runtime cleanup completed; memory stayed `1280×800`.                                                                                                                                                                                                                                                                                                                            |
| Final package: newly enabled custom resolution, then in-game choice   | Enabling custom resolution through the launcher UI created a new revision and restored its explicit `1280×720`, overriding remembered `1280×800`. After loading the world and another green-button round trip, the in-game menu selected `1280×800 Windowed`. Normal windowed quit saved that new size while launcher custom resolution remained enabled at `1280×720`.                                                                                                                             |
| Final package: unchanged custom-on relaunch                           | Reopened **windowed at `1280×800`**, with visible Cocoa outer frame `(116,72,1280,832)`. The custom checkbox, `1280×720` fields and revision were unchanged. This directly verifies the later in-game choice beats an older launcher default. Another normal windowed quit returned zero and completed cleanup.                                                                                                                                                                                     |

The first window's Cocoa outer frame was `(244,88,1024,800)`; the later one was
`(116,112,1280,752)`. These include title decoration. Saved sizes are client
units, not those outer sizes. The desktop was `1512×982` logical points on the
`3024×1964` panel. Native fullscreen content was **`1512×949`**, beginning below
the 33-point notch/menu region; AppKit selected that geometry. No panel mode was
changed or dimensions hard-coded.

The Metal HUD reported `1024×768` or `1280×720` windowed, **Composited**, versus
`1512×949` fullscreen, **Direct**. Game Mode showed **Off** in both modes.
A 2× screenshot/backing scale is not the game's render-target size. The HUD
presentation dimensions were 1× logical content with Retina off; the internal
scene render-target dimensions were **not independently measured**. The game
settings UI reported render scale 0.6.
No render-scale, VSync, Retina, display mode or keyboard mapping was changed by
the implementation. Fullscreen naturally changed the window/presentation size;
this report does not assert identical internal rendering workload.

The final package loaded the existing indoor game world. Pointer interaction,
Escape to the Paimon menu, settings and display-mode controls worked. Switching
focus to the launcher left the game's fullscreen Space; returning restored the
same game Space. The in-game graphics menu showed Render Resolution **0.6** and
VSync **Off**; neither was edited. Its initial display-mode label still described
the old borderless preference despite the observed titled window, so UI text
alone was not used as geometry evidence.

After the performance samples, selecting **1280×800 Windowed** through the
in-game menu changed the visible client/HUD to exactly that size. The driver
recorded it, then a green-button entry followed by Option+Command+Q closed the
game normally from a genuine fullscreen Space. Window memory retained 1280×800,
the temporary registry transaction completed, and the private runtime was removed.
The shortcut was exercised with PID-targeted diagnostic keyboard events; physical
keyboard coverage and all Command/Option mapping combinations are not claimed.

## Short alternating performance comparison

The final packaged runtime ran four arms in the order **W1 → F2 → W2 → F3** in
the same stationary indoor world scene/camera, with no intervening gameplay input.
Shaders had several minutes to warm; transitions/loading were excluded and at
least 12 seconds were allowed after changing mode. Each arm sampled six Metal HUD
screenshots over about 14 seconds (approximately 2.35-second intervals). Failed
initial OCR samples were excluded; the 24 successful samples retain raw HUD text
and local screenshots. The [24 numeric samples](native-fullscreen-hud-20260923.csv)
are committed without account/session data. These are periodic HUD readings,
not per-frame traces. Presentation labels were normalized after visual checks;
the CSV also preserves their raw OCR spellings (including “Dinect”).

All arms used the same final R2/fullscreen runtime, DXMT 0.80, target 150,
Retina off, Render Resolution setting 0.6, VSync off, panel and battery power.
Game Mode was **Off** throughout. Battery was 94% before world testing and 89%
after the comparison. `pmset -g therm` reported no recorded thermal/performance
warning; temperature and instantaneous power consumption were not controlled.

| Arm | HUD drawable | Presentation | Mean FPS (sample range) | Mean GPU ms | Mean frame interval ms |
| --- | ------------ | ------------ | ----------------------- | ----------- | ---------------------- |
| W1  | 1280×720     | Composited   | 116.03 (110.77–118.03)  | 7.31        | 8.62                   |
| F2  | 1512×949     | Direct       | 126.23 (119.57–130.22)  | 6.88        | 7.93                   |
| W2  | 1280×720     | Composited   | 113.73 (109.92–117.07)  | 7.33        | 8.80                   |
| F3  | 1512×949     | Direct       | 127.22 (120.62–130.89)  | 6.71        | 7.87                   |

**The short samples favored fullscreen on this host and scene.** Larger sample
counts and controlled frame traces are needed for a robust performance claim.
Fullscreen used a larger drawable and different aspect ratio; the internal scene
render-target dimensions were not independently measured. Thus the workloads
cannot be claimed identical, and this does not isolate presentation cost. HUD
capture/OCR overhead, battery conditions and sampling variation are additional
limits. No generic percentage speedup, 1% lows, frame-consistency improvement or
input-to-photon latency improvement is claimed. The panel refresh rate was not
changed.

## Remaining coverage and operation

The session briefly locked during testing; it was unlocked before the final
architecture/closing fixtures and final packaged-app game checks. China and
direct-route real-game launches, other hosts, Retina ON, changed physical monitor
configurations, physical relative-pointer capture and comprehensive keyboard
mapping tests remain unrun. A diagnostic mouse-move attempt did not provide
sufficient evidence to qualify physical capture behavior. China/direct launch
construction and registry tests passed. Work-area changes are helper fixtures, not a physical-monitor experiment.
The final closing-transition case covers interruption; a separate OS-denied
entry-failure injection was not performed. Long performance/latency tests remain
outside the short HUD comparison above.

Disable the fullscreen checkbox for ordinary/R2 runtime behavior; window memory
remains independent. If interrupted, retain the pending record and journal,
close owned Wine normally and restart YAAGL so exact recovery can run. Do not
delete snapshots or force the close guard to claim successful recovery. See
[operator/build/recovery instructions](native-fullscreen.md).

Local ignored evidence includes `.tmp/fullscreen-final-checks.log`,
`.tmp/fullscreen-final-preparation.log`, `.tmp/r2-regressions.json`,
`.tmp/window-registry-bounds.log`, `.tmp/fullscreen-final-x64.log`,
`.tmp/fullscreen-final-wow64.log`, `.tmp/fullscreen-final-close-unlocked.log`,
`.tmp/fullscreen-performance/`, and `.tmp/game*-*` screenshots/probes.
`.tmp/fullscreen-live.json` locates the disposable profile and guarded receipts.
Account/session dumps and screenshots are not committed.
