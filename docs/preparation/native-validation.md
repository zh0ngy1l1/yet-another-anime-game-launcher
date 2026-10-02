# Native extraction validation and review limits

This report covers the generic extraction, not another game-performance or
cursor investigation. All new execution uses isolated non-game fixtures and
private copies of the reference runtime. The accepted application, installed
application and game environment were not used for these tests.

## Recorded source and build

Wine commit `db11d0fe6a169c457e23d007e20404643d067aa8` plus overlay
`0d029255bce8f2f4ac47a1984b59ba82e09d9829` yields prepared baseline tree
`763e3aa9df162f403f5ef8dcff995c5db58fc044`. The retained local source repository
`../wine-fullscreen-extraction-source` has synthetic preparation base commit
`0b5773fdf68754bd59a96d47b6d9f11d797c3317` and extraction branch
`prep/generic-fixed-fullscreen`, head
`782396a1b55452aaeacbafaffdff9072e25e9216`, tree
`b648146dcde21e8b2552cfd0fd123bacedbb2386`. These local commit IDs are not
upstream Wine commits; the reproducible tree and source/overlay revisions are
the public baseline identity. The source branch was not pushed to any Wine
remote. Its exact source diff is hosted in the launcher prototype branch.

The final native patch changes **six source files, +93/-7**.
The launcher-hosted prototype is `4bfcc9dd1a89590cdcdc0e138677060cdd49b933`
on the clean upstream base; its 18-file / +1,972-line wrapper includes LGPL
license, patch text, documentation, build recipes and test fixtures. Patch SHA-256:
`0b1e9a96bc72a07510b420d2a851614167afe1fe73f39b8951457b6bd0b5bf02`.
The additional overlay registration changes one Portfile, **+2/-1**, and copies
that patch into its existing `files` directory. No game names, Unity window
reporting, window-state file transport, FPS, R2 or Game Mode remain in the native
delta.

Both unmodified and patched `dlls/winemac.drv/all` compiled. The final tracked
`build-driver.py` was run successfully against the verified prepared source;
its staged artifacts were hash-checked against the actual fixture runtime.
A separate fresh preparation reused checksum-verified downloads, freshly cloned
the pinned overlay, applied all 17 patches without fuzz, verified the baseline
tree and reproduced the exact extracted diff. Overlay registration also applied
cleanly in an independent checkout. No missing source/build input blocks this
reproduction. A first manual build invocation accidentally selected system bison
and failed on `%code`; the successful command and committed recipe select
Homebrew bison. This is not reported as a successful first attempt.

Host: Apple M4 (`Mac16,1`), macOS 26.6.2 build 25G83; Apple clang 21.0.0
(`clang-2100.1.1.101`), SDK 26.5, deployment target 14.0. The console was unlocked.
The fixture observed native fullscreen Space type 4 on the built-in display.
The build emits existing deprecated macOS API warnings and nullable-delegate
call warnings (including new calls following the existing pattern); it is not
warning-free. i386 PE was built but not executed in this assessment.

| Artifact | Final SHA-256 | Bytes |
| --- | --- | ---: |
| `lib/wine/x86_64-unix/winemac.so` | `a81727288b827e0084f708449eb4b595ca0ddad5312a8ea850db6022d05f0748` | 492816 |
| `lib/wine/x86_64-windows/winemac.drv` | `22d9dd76fd49697078652ccb7df133177befd60dfeaccc604ea021097f4ac269` | 75028 |
| `lib/wine/i386-windows/winemac.drv` | `c1ce3d05269f11e6fc3d48fb00f327fcb846ffde629f7c2ce7eb672e13a1c187` | 62977 |

The unmodified locally built native driver is
`7239d2961dd12ddffdbcfd4bd6af3f3d0b7a2d217ff6dea53467e9f94a34c33c`;
its PE hashes match the final PE hashes. Each fixture runtime contains a matched
trio, while its loader/server/ntdll remain from the pinned public reference
runtime. The native module was relocated, ad-hoc signed and strictly verified.
Outputs are local test artifacts, not a published runtime or a compatibility
promise for other builds. Publisher bit-identical reproduction is not claimed.

## Auxiliary-window comparison

The earlier accepted-fork fixture failed under Retina **off**, green-button
entry and a duplicate pending toggle in the first fresh prefix. Its owned window
moved `(155,146) → (-278,36)` and owned dialog `(230,212) → (-203,36)`, retaining
size/style. Later passes with different settings did not resolve that failure.
The historical failed log/checker output is retained with this handoff.

For this assessment the original Win32 fixture, observer, runner and geometry
checker are byte-for-byte unchanged. Baseline and extracted runs use newly
created per-case prefixes, Retina off, green-button entry and duplicate pending
toggle, with no display/settings changes between compared runs. The baseline
cannot fullscreen a fixed parent; its observer chooses the existing resizable
target. Therefore its pass can establish disabled/common behavior, but cannot
prove that a newly enabled fixed transition is regression-free.

An initial extraction (`b6512e5e…` patch, before the final eligibility-transition
fix) passed baseline-compatible disabled behavior, two identical fresh-prefix
enabled runs, Retina on, actual close-during-entry, and both global/AppDefaults
override directions. Those results are retained separately and are not counted
as final-revision validation. The final revision is rebuilt and checked in a
separate `final-validation` directory.

| Final-revision case | Result |
| --- | --- |
| Option absent, same original fixture as baseline | Pass: fixed feature remains unavailable; all 12 geometries/styles restored. |
| Option Y, Retina off, green entry + duplicate toggle, two fresh-prefix repetitions | Both pass: genuine Spaces, repeated entry/exit, same-session fixed/auxiliary restoration, no automatic reentry. |
| Option Y, Retina on | Pass on the same physical display; separate coverage, not a substitute for Retina-off comparison. |
| Actual close during entry | Pass: Win32 target destroyed, Cocoa shell hidden, no pending transition/Space, remaining windows usable. |
| Global Y + application N; global N + application Y | Both pass with expected fixed-window eligibility and all original geometry assertions. |
| Deliberate auxiliary update, baseline resizable parent | Pass, exact requested frame retained. |
| Same auxiliary update, patched resizable parent | Pass, exact requested frame retained. |
| Auxiliary update, patched fixed parent | **FAIL: position displaced on exit; requested size survives. Submission blocker.** |
| All-green-button entry and exit | Pass: every entry and exit used the ordinary green button; all original geometry assertions passed. |
| Injected failure/retry/closing callbacks | Pass on corrected fresh-prefix fixture; initial attribution failure retained separately. |

For the failing fixed-parent case, Win32 `SetWindowPos` changed the child from
`(220,200,240,180)` to `(251,237,324,242)` while the parent was in a verified
fullscreen Space. After exit, the final child rectangle was
**`(354,35,324,242)`**. The baseline and patched resizable-parent cases both
ended at the exact desired `(251,237,324,242)`. Cocoa logs likewise preserve
original, desired and final rectangles. The strict frame assertion remains
failed. The earlier static review suspected a size rollback; that specific
prediction was **not observed**, and must not be presented as a measured result.
The confirmed problem is position restoration for an explicitly updated owned
window in a fixed-parent session.

The original 12-window displacement did not recur in the same-condition new
runs. Its historical cause remains unclassified; this is not proof that it was
pre-existing or repaired. The new auxiliary-update reproducer isolates another
relevant failure in the newly enabled fixed-parent path. It is not a cursor
experiment or evidence about the accepted game's behavior.

The first callback-injection run completed its target-window state checks but
failed overall because Wine service processes inherited the diagnostic dylib
and each emitted “target missing” failures into the same log. This is a fixture
attribution bug, retained in evidence. The corrected observer runs only in the
process containing the named fixture window; a genuinely missing fixture still
fails because the runner requires exactly one successful RESULT and no FAIL
lines. The state assertions were not weakened. The corrected fresh-prefix
rerun passed all state assertions with exactly one successful RESULT. Its log/result are recorded separately; the initial failure
is not relabeled as passing.

## Proportionate acceptance matrix

| Contract | Required evidence / support boundary |
| --- | --- |
| Disabled absent/N, AppDefaults override | Same fixed-button eligibility and ordinary resizable behavior; all original geometries/styles preserved. Global/AppDefaults opposing values must select the existing precedence. |
| Eligible fixed and ordinary resizable | Actual Space type 4, ordinary green button, repeated entry/exit, exact windowed frame; no added Win32 resize permission or automatic reentry. |
| Excluded windows | Original fixture covers owned, tool, popup, dialog, ownerless dialog, noactivate, child and disabled. Layered/shaped/undecorated exclusions are source-inspected, not dynamically qualified here. |
| Transition lifetime | Duplicate pending request, actual Win32 close during native entry, no redisplayed shell, no pending Space, other windows usable. Callback-injected failure/retry is distinguished from a real OS-denied transition. |
| Same-session geometry | Unchanged 12-window assertions and explicit auxiliary-update reproducer. Never accept a parent-only pass as an all-window pass. Application-directed child updates must not be overwritten. |
| Retina | Separate off/on runs on this one display. No pointer, rendering scale, monitor switching or physical-input claim follows. |
| Wider support | Other macOS versions, Intel hosts, external/multiple displays, WoW64 execution, dynamic style/owner races during real AppKit transitions and genuine OS-denied entry remain untested. Narrow claims accordingly. |

The later launcher acceptance matrix, including FPS-absent direct/Steam,
abnormal completion and startup recovery, is in
[the integration sequence](launcher-and-game-mode-sequence.md#later-launcher-acceptance-matrix).
No launcher feature code changed here, so launcher CI/test totals are not
presented as evidence for this native patch.

## Reproduction and evidence

The prototype contains the real `allow-fixed-size-fullscreen.patch`, overlay
registration, LGPL text, exact independent build instructions, and
`tests/README.md` with serial baseline/patched and diagnostic commands.
`run-matrix.py` and `run-diagnostics.py` refuse reused case directories, retain
failures and bound process lifetime. No assertion was relaxed to make a run pass.

Local build logs/source remain under the prototype's `.tmp/native-build` and
`.tmp/extraction-recipe-check`; raw initial/final fixture logs remain under
`.tmp/validation`, `.tmp/final-validation` and `.tmp/callback-rerun`. All 21
owned fixture prefixes were drained and removed afterward; logs, source and
build artifacts remain. Checked-in evidence contains
the build record, case results, relevant raw fixture/observer logs and preserved
historical failure. No game/account/session captures are included.

## Submission blockers versus optional work

1. **Confirmed native submission blocker:** an application-directed owned-window
   position update does not survive fixed-parent fullscreen exit. Use
   `run-diagnostics.py ... patched-fixed` and its retained exact-frame failure.
   Resolve the interaction between saved child frames, AppKit attachment/motion
   and Wine's queued frame notifications, then rerun both unchanged geometry and
   explicit-update cases. Do not remove child restoration or relax the assertion
   merely to reduce the diff. The source is intentionally retained as a review
   prototype with this blocker, as authorized for this stage.
2. **Source/release decision before integration:** maintainers have not chosen
   the target Wine/overlay branch, accepted feature semantics, build owner or
   capability/release contract. No compatible new runtime release is published.
   A launcher setting must remain inactive until that concrete support exists.
3. **Review responsibility:** AI-assisted source audits and builds are not
   independent human Wine/AppKit review. The contributor must understand the
   transition latch, child-frame behavior and callback lifetime and obtain
   substantive review before claiming this is ready for upstream submission.

The eligibility-change super-toggle bypass found during static review was fixed
in the final patch: one feature reconciliation per update, guarded forced exit,
and a deferred eligibility check after entry. Real style/owner-change races need
focused follow-up coverage before claiming all such interleavings. Actual
OS-denied entry, additional systems and displays remain explicitly untested;
they constrain support claims rather than being counted as passed tests.

Optional follow-ups, rather than prerequisites for this generic extraction:
cross-launch size memory, game-specific observation transport, Game Mode,
additional runtime backends, broader hardware claims, performance work and
controller integration. The accepted fork keeps all of its current behavior.
