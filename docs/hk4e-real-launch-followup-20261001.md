# HK4E accepted candidate and real launch trace — 2026-10-01

The user opened `build/launch-polish-20261001/Yaagl OS.app`, launched Genshin,
played, and reported that it works, the name and icon are correct, and launch
time now feels acceptable. This is user-reported acceptance of that candidate
on the route/settings used, not a timed result or coverage of every combination
or presentation surface. The preserved candidate manifest identifies source
`4dfd3ad174907dea13f3f9a826d94963ab0fc481`.

The existing manual launch supplied a complete preparation trace and a matching
successful exit/cleanup record. No additional real game launch was needed to
recover this baseline. Read-only collection preserved the log and associated
bridge/Wine/Steam logs, settings and manifests before another launch could alter
them. The installed application and candidate share the **Yaagl OS R2** profile;
the staged package does not imply a separate profile. Candidate attribution uses
the user's reported package path and its manifest; the trace itself does not
embed a source SHA.

## Observed configuration and preparation

The request records Global Genshin, Wine `11.0-dxmt-signed-with-patches`, FPS
enabled at target 150, native fullscreen, Game Mode and Steam Patch enabled.
Retina, HDR, ReShade and Launch Fix are disabled. Saved DXMT is `654f547`; the
resource phase completed in 2 ms, so this was an existing-resource launch.
These settings are trace evidence, not independent proof of every feature's
visible behavior or achieved frame rate. Legacy saved FPS fields differ; the
request's admitted target and matching bridge worker both identify 150.

JavaScript spans share one request-relative monotonic origin. The following
preparation components do not overlap:

| Preparation component | Seconds |
| --- | ---: |
| Private runtime, including its existing-server wait and recipe | 24.448 |
| FPS registry snapshot | 6.081 |
| Setup, including Wine properties and window registry | 10.772 |
| Wine/Steam bridge boot to ready | 5.528 |
| Other admission, artifacts, resources, waits and intervening work | 1.012 |
| **Preparation total** | **47.841** |

Within setup, Wine properties took **3.571 s**, window-registry preparation
**6.640 s**, patch files **0.497 s**, and two Wine waits **0.030 s** combined.
These are children of the 10.772 s row, not additional preparation time.

Preparation began at request offset 0.001 s and ended at the explicit execution
boundary, offset **47.842 s**. Game-creation acknowledgement then took
**0.973 s**, ending at offset **48.815 s**. The matching bridge status reports
the attributed game and Steam child alive. Acknowledgement establishes process
creation, not a rendered window, login screen, interactive gameplay or display
of the running label. There is no timestamped visible-readiness measurement.

## Complete runtime inventory cost

The JavaScript recipe span took **24.418 s**, inside the 24.448 s private-runtime
span above. Native recipe phases use a separate monotonic origin at recipe
entry. Their forwarded JavaScript events all arrived near offset 24.501–24.502 s;
those receipt times are not native phase start times. Ordered native
`atMs`/`elapsedMs` records show:

| Sequential native phase | Seconds |
| --- | ---: |
| Initial pinned asset admission | 0.020 |
| Source inventory before clone | 6.162 |
| APFS clone | 1.544 |
| Copied-runtime inventory | 5.887 |
| Source inventory after clone | 5.613 |
| Equality and distinct-inode checks | 0.239 |
| Patch, asset copies and signature checks | 0.023 |
| Final output inventory | 4.846 |
| Receipt publication | 0.052 |

Native completion is at 24.386 s relative to its own origin. Four inventories
together take **22.508 s**, about
**92% of the enclosing recipe** and **47% of preparation**. Their recorded CPU
totals are 15.140 s user and 2.450 s system; CPU is not extra elapsed time. The
native table, its inventory subtotal, and the enclosing JavaScript spans overlap
and must not be added together.

This real request corroborates the recurring inventory cost in the earlier
21–25 s disposable recipe measurements. It justifies a bounded experiment to
accelerate complete byte hashing/traversal while preserving every admission,
source-stability, metadata, no-follow, independence and publication check. The
22.508 s is an opportunity bound, not promised savings. The existing-resource
phase gives no evidence for changing resource acquisition or Sophon. Registry
and bridge preparation are also material, but changing helper lifetimes would
affect ownership and restoration; retain that lifecycle while investigating the
smaller complete-verification change first. No persistent cache is justified.

## Startup, gameplay and cleanup boundaries

The first bootstrap log precedes the trace origin by **18.114 s** in wall-clock
log time. It reaches the DOM-ready/show-launcher record after **11.649 s**, with
Sophon health retries and game-info initialization in that interval. The next
**6.465 s** ends at the request's first timing record and can include user delay;
it is not a measured launch queue wait. Time before the first bootstrap record,
the actual click, reservation/queue latency and visible readiness are unmeasured.
These logs do not support attributing the whole pre-trace interval to launch
preparation or diagnosing a new Sophon defect.

The trace's bridge-identity event matches the token in the Steam/bridge logs and
the launcher status/cleanup records. The bridge adopts the direct Steam game
child, the FPS worker applies target 150, and later both worker completion and
game exit code zero are recorded. The launcher then observes the game and Steam
jobs empty, releases the bridge, confirms its direct Wine command completed,
waits for the owned Wine server, restores window and registry state, restores
journaled files, and removes the private runtime/resources. The matching outer
request ends `ok` at **260.633 s**. All 21 JavaScript spans end `ok`; the nine
native phases are complete and sequential.

First game-created status to first game-exited status spans **197.053 s** in
launcher log time. It includes loading and gameplay; it is not a gameplay-only
measurement. Game-exited status receipt to the matching completed-restoration
record takes **14.764 s**. This is a wall-clock exit/cleanup observation, not a
dedicated monotonic cleanup span. The bridge's own exit record is 102 ms earlier,
which would give 14.866 s to the same cleanup record after timezone conversion.
Neither interval is preparation or time to visible readiness.

The earlier “over two minutes” report remains historical. This request measures
about 48.8 s from its trace origin to game-creation acknowledgement; it does not
establish click-to-play duration. The user's latest assessment is that launch
time is acceptable. Neither subjective statement is converted into a benchmark.

## Evidence and retained limits

Raw machine-specific data stays local under
`.tmp/launch-followup-20261001/manual-run/`; derived interval calculations,
identity mapping, source hashes and log locations are in
`.tmp/launch-followup-20261001/manual-trace-analysis.json`. No raw paths, account
details, request token or game-memory diagnostics are published here. The
accepted package remains available for comparison/recovery.

This is one successful real launch, not a repeated controlled game benchmark.
The prior independent recipe/helper results remain separate experiments. Cursor,
Retina, resolution and geometry behavior are unchanged. The previously recorded
auxiliary-window fixture displacement remains a known observation in the
[cursor report](hk4e-cursor-investigation.md); it is neither reclassified as a
pass nor investigated further in this follow-up.
