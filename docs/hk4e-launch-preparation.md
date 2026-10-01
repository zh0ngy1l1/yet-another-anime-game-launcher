# HK4E preparation investigation — 2026-10-01

The measured recurring filesystem bottleneck is **four complete runtime
inventories**, not APFS cloning or signature verification. They consume
19.65–23.62 seconds of a 21.47–25.47 second preparation recipe. Existing logs
also show meaningful Wine registry/helper startup work. These findings do **not**
yet explain the reported consistent delay of more than two minutes. This stage
adds diagnostics and measurement tools; it introduces no performance shortcut or
persistent runtime cache.

The user reports many successful gameplay runs with the previous installed
candidate (`f00f01c`, followed by documentation-only commits). Historical logs
below describe that candidate. No real game was launched for this investigation,
and the new candidate is not gameplay-qualified by these measurements.

## What the status labels cover

`src/launcher/index.tsx:onButtonClick` reserves ownership before queuing the
primary action; `src/launcher/launch-ownership.ts:reserve` displays **Preparing
launch**. For the installed/current-game Launch action the subsequent path is:

1. `src/clients/mhy/hk4e/index.tsx:launch` calls `launchGameProgram`.
2. `program-launch-game.ts:ownedLaunchGameProgram` validates the regional
   executable, persists/admits FPS settings, admits Game Mode/platform support,
   waits for the selected Wine server, prepares the private runtime when FPS or
   native fullscreen requires it, and stages window-registry controls.
3. On the FPS route, `launch-fps-game.ts:prepare` changes ownership text to
   **Preparing game…**. It stages/verifies the request's bridge and Steam inputs;
   checks/acquires ReShade and DXMT resources; awaits existing Wine activity;
   durably snapshots registry values; journals files; sets Wine driver properties;
   saves/applies window controls; optionally applies HDR and ReShade configuration;
   patches graphics/Steam/protection files; waits for Wine; boots the owned bridge
   and Steam root; and waits for Launch Fix readiness if enabled.
4. `launch-fps-game.ts:launch` issues the real execution request. The bridge's
   execution-artifact recheck and game-creation acknowledgement follow this
   boundary. Running status follows attributed game observation. Preparation
   diagnostics end before this operation, and separately time its acknowledgement.

The FPS-disabled route retains the initial ownership label while resources,
window/registry/file setup and optional Launch Fix prepare. Its progress channel
also emits `PATCHING`. Its execution boundary is immediately before `wine.exec2`.
The diagnostic spans cover both routes without changing ordinary UI/error text.
The running message remains exactly
`Game is running (DO NOT CLOSE THE LAUNCHER)`.

Sophon startup and `getLatestOnlineGameInfo`, installed-game version discovery,
Wine installation, and startup recovery occur during client initialization, not
inside an ordinary current-game launch preparation. The primary action can also
be an update/install when the UI requires it; that invokes separate programs,
including Sophon. These must not be misreported as runtime preparation. The
new launch trace starts when `launchGameProgram` is constructed; any preceding
startup, primary-action reservation/queue delay or update is outside its origin.

`resources` includes the existing version/completeness checks and any necessary
resource download/extraction. ReShade and DXMT are sequential in the caller.
The repeat DXMT path checks the stored `654f547` version and every required
nonempty file. No game update, download, repair or Sophon task is submitted by
our measurement tools.

## Repeated production recipe measurement

`scripts/measure-launch-preparation.py` invokes the **actual production
`prepare-r2.pl`**, not a translation of it. It first APFS-clones the complete
local Wine input into its own disposable directory, then invokes the recipe
three times with fresh private outputs. A non-executable placeholder supplies
only the Game Mode path/inode identity; no Wine or game process is started.
The prefix is an empty disposable directory. Each completed output is removed,
and the input clone/prefix/placeholder are removed when the harness ends.
Input/output trees must be disjoint. No working cache is cleared.

Measured on Apple M4 / macOS 26.6.2, native system Perl, APFS. Input: qualified
Wine 11.0 `11.0-dxmt-signed-with-patches`, original ntdll SHA-256
`f26ade35f5b49e33b3780b6adc71f9eb9c831ea40222c1bae667ac14135d984b`.
FPS, native fullscreen and Game Mode are enabled, Global host selected. Updated
presentation assets are included. Output: 11,047 regular files and
2,145,048,719 logical bytes. Steam, Retina, HDR and ReShade do not change this
filesystem recipe and are not exercised by this measurement.

| Sequential recipe phase (seconds) | Run 1 | Run 2 | Run 3 |
| --- | ---: | ---: | ---: |
| Source inventory before clone | 6.220 | 5.574 | 4.408 |
| Copied-runtime inventory | 6.250 | 6.288 | 6.306 |
| Source inventory after clone | 5.514 | 5.124 | 4.427 |
| Final output inventory | 5.639 | 5.213 | 4.505 |
| **Four inventories subtotal** | **23.623** | **22.199** | **19.646** |
| APFS clone | 1.486 | 1.518 | 1.481 |
| Inventory equality / distinct inode checks | 0.235 | 0.234 | 0.227 |
| Pinned input/asset admission | 0.017 | 0.015 | 0.014 |
| Patch, asset copies and signature checks | 0.025 | 0.019 | 0.019 |
| Receipt publication | 0.052 | 0.053 | 0.053 |
| **Whole recipe wall time** | **25.469** | **24.068** | **21.472** |
| Recipe CPU user / system (`time -l`) | 15.40 / 4.01 | 15.65 / 3.92 | 15.76 / 3.87 |

Values are rounded; whole-recipe time includes process startup/exit and minor
phase-boundary overhead. The subtotal overlaps its four listed rows and must
not be added again. CPU time is not extra elapsed time.

All resources already existed locally. Run 1 is the first measurement after
input cloning, **not** a cold disk-cache or first-install benchmark. Runs 2/3
reuse the same source and natural OS cache state but never reuse a prepared
output. The machine's caches were not flushed. The recipe code measured has
SHA-256 `c3395d9f81e30fa4e6425b1feb23f1c1cb92f26eda2c84e27a1830f07ffea50d`;
source/assets were the work under review and were subsequently committed.

Per-phase `times()` counters show roughly 15.1–15.5 seconds of user CPU in the
four inventories. Whole-process peak RSS is about 51 MB. `time -l` reported
14–18 page faults and zero block input/output operations. These macOS/APFS
counters do not mean no file bytes were read: the recipe hashes about four
runtime images, roughly 8.58 GB of logical input. The large user-CPU share,
repeated reads, process samples showing Perl/cp/codesign, and absence of network
operations support hashing/traversal as the dominant measured cost. The
wall/CPU gap is scheduling/filesystem/cache behavior, not evidence of a network
wait. Recipe-only CPU comes from `time -l`; the harness also records
`RUSAGE_CHILDREN`, explicitly including its once-per-second `ps` sampler.
Per-launch signing is not performed: the recipe verifies already-signed assets.

## Independently measured Wine helper preparation

`scripts/measure-wine-preparation.cjs` builds an authored native fixture that
calls the actual `createWine.setProps` and `createWindowSession.prepare/finish`
over the production Neutralino RPC. It uses a separately prepared private R2 +
fullscreen runtime, a fresh disposable prefix and real signed window-registry
helper. No game file exists and no game-launch API is called. First-use
`wineboot -u` plus drain takes **18.473 seconds**, recorded separately from the
three repeated preparations. The fixture finally drains its own Wine server,
checks process/open-file references, and removes its private profile/runtime.

Settings: Global registry, FPS-patched runtime, native fullscreen on, Retina/HDR/
custom resolution off; Game Mode routing off. Helpers on the enabled Game Mode
route retain ordinary Wine identity, so this measures their corresponding code
without exercising the actual-game routing or Steam/bridge boot. It does not
measure ReShade, DXMT acquisition, FPS registry snapshots, protection/file
patching or game creation. Runtime recipe/build time is outside these spans.

| Sequential helper phase (seconds) | Run 1 | Run 2 | Run 3 |
| --- | ---: | ---: | ---: |
| Wine properties command + server drain | 4.274 | 4.219 | 4.218 |
| Window-session artifact admission | 0.077 | 0.064 | 0.060 |
| Window registry save/apply + server drains | 4.268 | 4.286 | 4.253 |
| **Preparation subtotal** | **8.619** | **8.569** | **8.531** |
| Registry restore and cleanup (separate) | 4.068 | 4.054 | 4.024 |

The whole native fixture, including first use and three restorations, takes
56.68 seconds; `time -l` reports 1.42 seconds user and 0.94 seconds system CPU,
100 MB peak RSS, and zero block I/O operations. These are native launcher and
waited-descendant counters, **not** complete per-phase CPU for detached Wine
services. Once-per-second samples include the fixture's wineserver by its owned
runtime path; samples commonly show sleeping processes with little CPU change.
Together with the repeated approximately four-second command/drain intervals,
this supports a startup/lifetime-wait cost rather than sustained computation or
network I/O. It does not establish which individual Wine service causes every
wait, nor justify removing any wait. A helper/session consolidation experiment
has an observed **8.5-second preparation budget** to investigate, with actual
savings still to be measured. Cleanup is outside that opportunity figure.

These helper results and the filesystem recipe results are independent bounded
experiments; adding their totals does not produce a measured real launch time.
The new production spans will measure these operations in the complete request.

After the documented native/developer prerequisites are available, reproduce
with the pinned Node/pnpm toolchain:

```sh
npm exec --yes --package=node@16.20.2 --package=pnpm@7.33.7 --call \
  "node scripts/measure-wine-preparation.cjs '/absolute/qualified/wine' '/absolute/new/evidence'"
```

The successful local evidence is
`.tmp/launch-polish-20261001/helper-measurements-final/`. An earlier fixture-only
path-normalization guard rejected its own trailing-slash comparison before Wine
started; the guard was corrected, and its unstarted disposable state was removed.
No product admission rule was relaxed. The successful run independently confirms
all owned Wine processes/references are gone and the disposable state is removed.

## Historical normal-launch evidence

Read-only analysis found five October 1 launches in the previous installed
candidate's existing log. The command logger records before execution, enabling
these **wall-clock log interval** estimates; they are not monotonic instrumented
measurements and are not a fresh run performed for this task.

| Interval (seconds) | First DXMT acquisition | Repeat A | Repeat B | Repeat C | Repeat D |
| --- | ---: | ---: | ---: | ---: | ---: |
| Private recipe command → runtime prepared | 24.142 | 21.952 | 22.395 | 21.266 | 23.147 |
| Bridge acquisition → registry setup begins | 51.515 | 1.271 | 0.944 | 1.018 | 0.921 |
| FPS registry save issued → owned completion | 6.424 | 6.102 | 6.388 | 6.922 | 6.393 |
| Registry saved → setup complete | 11.211 | 10.614 | 10.632 | 10.807 | 10.746 |
| Setup complete → first game-created status | 6.592 | 6.486 | 6.824 | 7.343 | 6.500 |
| **Recipe command → first game-created status** | **99.987** | **46.502** | **47.270** | **47.511** | **47.771** |

All five selected FPS/native fullscreen/Game Mode/Steam, target 150; Launch Fix
was off. Resource logs show the first run replacing old DXMT with `654f547`,
about 50 seconds before ZIP extraction starts. That interval includes download
and its waits; there is no network-throughput measurement here. Repeated launches
reuse the resource. The table's interval boundaries omit small gaps and the
whole row is inclusive. Some window-size preferences differ across runs; these
are historical context, not controlled comparative game benchmarks.

The repeat measured interval is approximately 47 seconds, while the first
acquisition interval is approximately 100 seconds. Neither proves a complete
click-to-running time. Initial reservation/queue/startup delays, user-visible
rendering, and time beyond the first game-created status were not precisely
bounded in these logs. A real trace from the candidate is required to reconcile
the reported two-minute experience.

## Diagnostic contract and reproducible capture

`launch-timing.ts` uses `performance.now()` with a request ID and numbered named
spans. Begin/end records include offsets from the request origin, elapsed time
and `ok`, `error` or `cancelled`; cancellation requests are explicit events.
Preparation failure/cancellation closes the preparation span before cleanup,
while the outer request span remains open through owned cleanup/recovery.
The launch boundary is explicit; a bridge-identity event maps the trace request
to the native FPS token. Logs also record runtime, region, feature flags
and FPS target. Logging failures cannot change launch behavior.

Nested spans (for example `setup` containing `wine-properties`,
`window-registry-prepare`, `hdr-registry`, `patch-files`) overlap. Compare their
intervals; do not sum parents and children. The same applies to the outer
`preparation` and `private-runtime` spans. Native recipe records use a separate
`CLOCK_MONOTONIC` origin relative to recipe entry, the same request ID, and
per-phase CPU. Successful child records are forwarded as `runtime-span` events;
the outer event's `atMs` is log receipt time, **not** child start time. The child
`native.atMs`/`elapsedMs` determine its ordering within the enclosing recipe.
On recipe failure its stderr (including completed/failed native spans) remains
in the existing command-error diagnostic chain.

To capture a normal launch, use the separately staged candidate only when the
working launcher/game is stopped. Keep the launcher open through normal exit
and cleanup. Save that run's `neutralinojs.log`, matching `game_*.log.*`, settings
and approximate click/running times. Extract the diagnostics locally:

```sh
rg 'HK4E_TIMING|HK4E_RUNTIME_TIMING' '/path/to/profile/neutralinojs.log' > preparation-trace.log
```

If the delay occurs before the first trace record, preserve preceding startup
and Sophon log context too. Do not alter recovery journals or a live prefix.
These logs may contain local paths; review before sharing publicly.

Portable filesystem measurement (Python 3.13; no Wine execution):

```sh
python3 scripts/measure-launch-preparation.py \
  --runtime '/absolute/path/to/qualified/wine' \
  --output '/absolute/path/to/new/local/evidence' --runs 3
```

The output retains raw stdout/stderr, per-second process samples and JSON phase
and CPU summaries. It never launches an executable from the game installation.
It stops after receipt publication, before `createWine` or any Wine helper.
The production wrapper's existing-server wait, UI/native RPC, resource handling,
registry/file journals, helper readiness and real game creation are outside
this recipe's measured interval.

## Next-stage candidates, ranked

1. **Accelerate complete inventory hashing/traversal while retaining every
   check.** Investigate a small native streaming SHA-256 implementation or
   bounded parallel inventories, first benchmarking identical inputs and
   outputs. The measured budget is 19.65–23.62 seconds of wall time, including
   about 15 seconds of user CPU. That is an opportunity bound, not a promised
   speedup. No implementation was selected or substituted in this stage. Keep
   no-follow file opens, canonical link validation, exact manifests, source
   stability, private inode checks and final output verification. Regression
   checks must compare complete receipts and reject changed bytes, modes,
   symlinks, concurrent source mutation and abandoned outputs. Bounded parallel
   work must still fully settle before publication or cleanup.
2. **Investigate repeated Wine helper startup/drain around registry setup.**
   `wine.ts:setProps` runs a registry command and waits; `window-session.ts`
   performs its own save/apply and waits; `launch-fps-game.ts` snapshots registry
   separately before setup and boots the bridge afterwards. Historical registry
   save plus setup costs approximately 17 seconds, with another 6.5–7.3 seconds
   for bridge boot/game acknowledgement. Only measured helper portions can be
   claimed as potential savings; the game-creation portion remains unqualified.
   The isolated helper preparation above independently measures 8.53–8.62 seconds
   of that opportunity. A future grouped helper/session could amortize startup,
   but must preserve
   durable preimages before mutation, request ownership, crash recovery and
   original registry/file restoration. Test cancellation between every helper,
   failures after each journal write, direct/Steam routes and normal/abnormal
   exits. Never just remove `wineserver -w`, shorten readiness timeouts, or return
   before owned work settles. Existing 30-second timers are pending-operation
   notices, not fixed preparation sleeps; readiness polling is 100 ms (Launch
   Fix uses 50 ms). No artificial two-minute sleep was found.
3. **Keep resource acquisition separate from repeated-launch optimization.**
   The first-use DXMT interval contributes about 50 seconds once in these logs;
   repeat acquisition/bridge/wait is under 1.3 seconds. Existing complete-resource
   reuse already handles this case. Measure any unexpectedly repeated download
   with version/completeness diagnostics before proposing a change. No game
   updater/Sophon optimization is justified by these preparation measurements.

Persistent runtime caching is **not recommended for the next first experiment**:
patch/signature work is about 0.02 seconds and cloning about 1.5 seconds; faster
complete hashing or safely amortized helper startup can address larger costs
with less state. If a later cache is justified, cache only an immutable verified
runtime template keyed by source byte inventory, recipe/manifest/toolchain and
selected asset identities. Revalidate content and signatures to detect source
changes or corruption, atomically publish complete receipts, and reject partial
entries. Each launch still needs a private APFS clone and fresh Game Mode
path/inode/prefix request, graphics/file mutations and journals. Never reuse a
live launch directory. Full verification on cache hits can consume much of the
nominal benefit and must be included in the comparison.

## Verification

The focused timing/preparation/launch suites pass 108 tests, including meaningful
checks for overlapping intervals, diagnostic failures, original errors, generator
return, and cancellation that ends preparation while retaining cleanup ownership.
TypeScript passes. Existing native preparation/admission/signature checks remain
required; the candidate's delivery report records the final broader gates.
The harness's disjoint-output rejection was exercised before any runtime write.
The real shell-transport regression also asserts native admission failure timing
and empty publication stdout; structured success forwarding tolerates malformed
diagnostic lines without changing admission.
Raw machine-specific evidence is ignored under
`.tmp/launch-polish-20261001/timing/`, including historical milestone extracts and
`representative/runtime-measurements.json`.
