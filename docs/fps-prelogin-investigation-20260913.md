# Enabled FPS pre-login investigation, September 13, 2026

The current evidence supports an enabled-route startup failure **before the FPS
worker starts**. It does not establish that the historical Wine write/protection
hazard caused this failure. The supported correction is persistent Wine/bridge
diagnostics and reporting the actual game's exit status separately from bridge
success. Real-game crash resolution remains unverified.

## Preserved inputs and run identities

The initial checkout was clean at `2d210438f949f4f2b9262bb0b01ee32953d80af8`,
parent `888ea8975dcabd8509d6cf90e3dc5269b17b21fc`. Its development bridge was
version 2, 34,304 bytes, SHA-256
`3dac6250497a7265e0a62126125d3e850e67e7b7dabb9f0d34264fb5c08ddd8f`.
The complete 790-line launcher log, every adjacent game/Steam/DXMT log, settings,
native/bridge identities, prior preservation package and retained dumps were
copied before editing. Originals and existing legacy modifications were retained.

The private evidence directory is:

`/Users/david/Library/Application Support/YAAGL Local Builds/current-fps-crash-20260913T042233Z`

It contains `preservation-manifest.json`, `launcher-log-index.txt`,
`current-crash-reports/`, `crash-dump-summary.json`, `game-identity.json`,
`post-run-restoration-inventory.json`, `runtime-comparison/`, `legacy-recovered/`,
`legacy-retained-local/`, scoped legacy transcript excerpts and `checks/`.
The original `.tmp/fps120-investigation-20260912-224427` was also preserved.
Historical instructions and deployment scripts were read as evidence, not run.

All times below are September 12, local EDT (UTC−4). Request-token prefixes are
labels, not interchangeable process identities.

| Run                                 | Evidence                                                                                                          | Result supported                                                                                                            |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Disabled, Steam Patch on            | `game_1789265214505.log`, 21,795 bytes; launcher lines 110–253                                                    | Operator reports successful launch and normal game exit. DXMT maximum 60 is logged. Restoration commands complete in order. |
| Enabled 120                         | `game_1789265491290.log` and `.steam.log`, both empty; request `80e9d8eb…`, directory `/tmp/yaagl-fps.EA6dq7R7tm` | Operator reports crash before login; game handle exit is recorded. No worker start.                                         |
| Separate recorded target 61 attempt | `game_1789265549580.log` and `.steam.log`, both empty; request `de5a39af…`, directory `/tmp/yaagl-fps.AUxlK4cqq6` | Log records creation and exit before worker start. No supplied operator gameplay result; not a pass.                        |
| Enabled 60                          | No matching run supplied or found                                                                                 | Unrun/unverified.                                                                                                           |
| Packaged game                       | No operator game execution during this work                                                                       | Unrun/unverified.                                                                                                           |

Persisted development settings at collection: FPS enabled, target **61**, Steam
Patch true, Wine tag `11.0-dxmt-signed-with-patches`, DXMT 0.80, timeout fix and
Metal HUD true, game directory `/Users/david/.gimpact`. `config_block_net` is absent;
its source default is false. No settings were changed. Historical provenance
acceptance in `.tmp/step7.5/authorization.txt` remains recorded; game operation is
the user's. The current executable is AMD64, NX compatible, image base
`0x140000000`, image size `0x1a329000`, SHA-256
`a1a23cb76d941df28c5156ca3152fa49421ec98842221b7d71633d42ee76ca45`.
The launcher reports game version 7.0.0. Historical dumps have the same main-image
timestamp/size; that alone is not a historical whole-file hash comparison.

## Timeline and cleanup

| Event                                                  | Disabled                                               | Enabled 120                                                                                          | Recorded 61 attempt                                                              |
| ------------------------------------------------------ | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Game route issued / bridge staged                      | 22:06:54.506: signed system32 shim, game DXMT 60       | 22:11:31.531: private bridge, game DXMT 0, target 120                                                | 22:12:29.817: private bridge, game DXMT 0, target 61                             |
| Bridge idle handshake                                  | N/A                                                    | 22:11:37.905, sequence 0                                                                             | 22:12:36.183, sequence 0                                                         |
| Shim ready and actual game created/resumed             | Exact Win32 creation time/PID not captured             | By 22:11:38.264, sequence 1: game PID 224, shim PID 200, game job 1, Steam job 4                     | By 22:12:36.544, sequence 1: game PID 224, shim PID 200, game job 1, Steam job 4 |
| Discovery/probing                                      | N/A                                                    | 22:11:38.378, sequence 2 onward; existing 10-second initialization window                            | 22:12:36.657, sequence 2 onward; same window                                     |
| Worker start / memory work                             | No FPS companion                                       | All recorded states through release: generation 0, idle, done. No worker start/resolution/read/write | Same generation-0 lifecycle                                                      |
| Root exit observed                                     | Wine wait starts 22:08:59.647                          | 22:11:47.947, sequence 55; game job 0, shim exited, Steam job 1                                      | 22:12:46.005, sequence 54; game job 0, Steam job 4                               |
| All jobs empty                                         | No handle/job telemetry on this route                  | 22:11:48.984, sequence 60                                                                            | 22:12:47.016, sequence 59                                                        |
| Release and foreground supervisor confirmed            | N/A                                                    | 22:11:49.115 / .208; supervisor status 0                                                             | 22:12:47.135 / .206; supervisor status 0                                         |
| First postgame Wine wait completed                     | Second wait begins 22:09:03.641                        | 22:11:52.284                                                                                         | 22:12:50.297                                                                     |
| Registry restoration and its owned execution confirmed | No enabled registry snapshot transaction               | 22:11:53.268                                                                                         | 22:12:51.291                                                                     |
| Second Wine wait completed                             | File restoration begins 22:09:03.675                   | 22:11:56.369                                                                                         | 22:12:54.427                                                                     |
| Files/resources cleanup                                | Journal removed, directory removal issued 22:09:04.455 | Explicit completion 22:11:57.139                                                                     | Explicit completion 22:12:55.188                                                 |

Generation is monotonic in the inspected version-2 bridge and increments before
`CreateThread(apply_fps)`. Its sole game-memory write is inside that worker. Thus
the generation-0 lifecycle is affirmative evidence against this bridge's FPS
write triggering these exits, stronger than missing write messages alone. It
does not exclude writes by Wine, the game, or another actor. Signature resolution,
FPS address, current integer and protection samples were not captured for either
current run. Initialization is inherited policy, not a demonstrated safe-start rule.

Enabled cleanup is confirmed by the logged handle/job/thread states, release,
supervisor completion, both Wine waits, registry restoration acknowledgement and
final restoration message. All six referenced owned-supervisor directories and
both FPS directories were already absent at collection; no protocol commands
were written. The disabled journal directory was also absent. Fourteen restored
destinations currently exist with no adjacent `.bak` files, and no patch marker
remains. Original snapshots were deleted by completed cleanup, so independent
before/after byte equality cannot now be re-proved. No unresolved current request
was released or game relaunched by this investigation.

The disabled log is not entirely error-free: its last line is Wine thread `0168`
at Wine time `12466.430`, `virtual_setup_exception nested exception on signal stack
addr 0x7ff804a733a0 stack 0x43dbfff0`. This is near exit, before the first postgame
wait. It does not negate the reported usable session, but means an entirely
clean low-level shutdown is not established. There is no corresponding symbolized
stack/process attribution or recorded exit status. Operator-observed normal exit
and confirmed restoration are separate facts.

## Current crash versus historical faults

No retained September 12 enabled-run exception report, terminal output, stack or
fault-time page record was found. The supervisor explicitly redirected child
Unix stdout and stderr to `/dev/null`; empty Win32 game/Steam logs cannot recover
Wine's Unix-side diagnostics. Current Genshin PID 224 exit is established, but its
exception/signal, faulting instruction/address, module offset and stack are unknown.
The contemporaneous macOS `cp` diagnostic is a resource diagnostic, not a Genshin
crash report. The macOS Yaagl report at 18:38 predates these runs.

The four retained game dumps in the development prefix are dated September 9–11,
not the current run. Their UTF-16 error text truncates addresses; minidump exception
and module streams establish full 64-bit addresses. They contain raw stack/context
data, no memory-info stream, and no trustworthy symbolized stack or crash-time
current protection. Relevant older signatures are:

| Historical error time                               | Instruction / image-relative offset                                                          | Read / data-relative offset                                                                        |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Sep 9 22:26:45 and Sep 10 01:11:45                  | `8b 05 4e 62 c9 03`: `mov eax,[rip+0x3c9624e]` at `0x14161dff0`, game + `0x161dff0`          | Four bytes at `0x1452b4244`, game + `0x52b4244`, archived FPS destination                          |
| Sep 10 10:41:11                                     | `f2 0f 10 05 42 da 1a 04`: `movsd xmm0,[rip+0x41ada42]` at `0x14110708e`, game + `0x110708e` | Eight bytes at `0x1452b4ad8`, game + `0x52b4ad8`, historically identified CanvasRenderer bounds    |
| Sep 11 17:55:21, additional uncorrelated old report | `48 83 3d cd 2a cb 03 00`: comparison at `0x14160155b`, game + `0x160155b`                   | Eight bytes at `0x1452b4030`, game + `0x52b4030`; runtime identity for this report not established |

All four exceptions are `0xc0000005` reads, thread 204; the first three address
relationships reproduce the documented legacy signatures. They share page
`0x1452b4000`. That does not identify the present fault or its cause.

Legacy history was recovered with `git show` at cleanup parent
`b77fb00af2d72aee0ef89473692b7f469de6715e`, including both release documents,
runtime source/fixtures/provenance/build records and acceptance/deployment source.
`7552f9b` introduced the field correction; `0d703b4` revised the temporary-protection
calculation. Revision 1 (`702394b6…`) is rejected and was not used as a candidate.
The named `crash-analysis`, `automatic160-crash-analysis/revalidation-20260910`,
`universal-automatic-implementation` and `universal-automatic-deployment-review`
directories were retired. Exact references into them remain unavailable. Scoped
transcript excerpts are secondary recovery evidence, not restored raw traces.

The surviving `RECOVERY-NOTE.md`, successful transaction's `deploy-complete.json`
(SHA-256 `132e61c3a04ad0d05076e5704ab48d7e24fefae476813bb00d8fcebe74a5bbdd`)
and `r2-finalization-20260911T171344264581Z/FINAL-ACCEPTANCE.json` establish recorded
revision-2 deployment and operator acceptance: approximately one day at
90/120/144/150/180, expected unlocking and no reported instability. They explicitly
lack precise FPS/write telemetry, per-target dwell times and fresh acceptance
logs. The older README's unexecuted-plan language is not the acceptance source.
The old successful transaction was not resumed; its records say restoration had
not been performed. Today's per-game symlink is a later, different runtime identity.

## Actual Wine comparison and bounded candidate

All comparisons used independent copies and read-only disassembly/signature checks.

| Runtime                                                 | `ntdll.so` SHA-256                                                 | Relevant implementation                                                                                                     |
| ------------------------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| Selected `yaaglwdos/wine/lib/wine/x86_64-unix/ntdll.so` | `f26ade35f5b49e33b3780b6adc71f9eb9c831ea40222c1bae667ac14135d984b` | Original allocation-based predicate/calculation                                                                             |
| Working profile's general `Yaagl OS/wine`               | `f26ade35f5b49e33b3780b6adc71f9eb9c831ea40222c1bae667ac14135d984b` | Same original bytes                                                                                                         |
| Per-game `wine.original-before-fixed-fullscreen`        | `eef64f611ae9033261a70f46ec0be38d58823717f14e80331946c6d0cd3c85f7` | Exact signed revision 2                                                                                                     |
| Per-game `wine` symlink's current target                | `1847d332d702d12b68d4ba9031a01508546a3e6cf6147bd3b0a0a21de4bb26c9` | Different binary: inspected `NtWriteVirtualMemory` at `0x65700`, allocation load at `0x658ad`, old calculation at `0x658b8` |
| Successful deployment's archived rollback               | `f26ade35f5b49e33b3780b6adc71f9eb9c831ea40222c1bae667ac14135d984b` | Exact original, 620,688 bytes                                                                                               |

All listed copies passed strict signature verification. No selected runtime was
patched, installed, signed or given altered security metadata. Comparison of the
different per-game binary was restricted to this memory-write mechanism.

The selected binary's `NtWriteVirtualMemory` contains the downstream helper
inline, loading `AllocationProtect` from query buffer +16 at `0x66c6d`, testing the
executable nibble, then making two separate protection calls. The bridge imports
`WriteProcessMemory`; Wine 11's writable-page branch calls `NtWriteVirtualMemory`.
Its current write path would therefore reach the relevant mechanism once started.
It was not started in the recorded current attempts.

The demonstrated defect is allocation-wide executable metadata classifying a
currently non-executable data page. For allocation `0x80` / current `0x08`, the
original helper transiently requests `PAGE_NOACCESS`. Revision 2 uses current
`Protect` and maps executable access to the corresponding non-executable access,
preserving modifiers. The source was applied with zero fuzz to hash-pinned Wine
11 and overlay; corrected source hash is
`ee3feb8b45f94076f3502e79d0e2fa5112214a1adc2b7110c47b8397eb72b8df`.
Independent binary comparison confirms 13 changed code bytes and 31 embedded
signature bytes between original and the existing signed revision-2 copy.

`runtime-review/` contains the verified existing signed candidate, source/binary
comparison and fresh source-extracted ASan/UBSan mock results: 300 targets,
allocation/current protection combinations, access preservation, the revision-1
guarded-page failure, six rejected mutations and residual protection-failure
analysis. Historical trace/managed replay was not rerun with missing inputs.
No builder signing or historical deployment machinery ran. This package is for
offline review; it is not an installed or proven current-crash fix. General
executable-page failure handling, concurrent mapping races and Rosetta cache
semantics remain outside its assurance.

Primary source references: [Wine 11 memory API](https://github.com/wine-mirror/wine/blob/wine-11.0/dlls/kernelbase/memory.c),
[pinned downstream helper](https://github.com/riverfog7/macports-wine/blob/0bf32337c0c2d2a699fc392f5db570cf42ca0f27/emulators/wine-devel/files/0001-ntdll-CW-HACK-18947.patch),
[revised correction](https://github.com/zh0ngy1l1/yaagl-fpsunlock-gamemode-legacy/commit/0d703b464a76d33c1215c2fc53170e64c136e1f4).

## Ranked explanations and correction scope

1. **Enabled creation/rendering context, unresolved within this group.** Both
   observed current exits precede worker startup. Disabled runs the signed
   system32 shim directly; enabled stages it privately, runs a relay and creates
   the game from the bridge with the retained shim as Windows parent, explicit
   inherited standard handles and nested jobs. The shim child command, image/DLL
   location, Unix parentage and job/handle context differ. Source preserves game
   arguments, intended cwd and ordinary environment, but no current runtime
   environment/parent/loaded-module snapshot proves equivalence. The game DXMT
   maximum also changes from 60 to 0. A captured enabled-60 run holds that maximum
   at 60 and can discriminate the pre-worker context from this renderer change.
2. **Other startup failure or interference.** Without current fault/stack/Unix
   stderr, a loader, graphics, game or environment error remains possible. Capture
   of actual stderr, exit status and a contemporaneous dump/process snapshot is
   required to narrow it. Fixture success does not establish Genshin equivalence.
3. **Historical protection hazard from this FPS worker.** The mechanism is real
   in selected Wine, but generation 0 strongly contradicts this explanation for
   these attempts. A later run with a confirmed write and a matching current fault
   would be different evidence. Other callers of the same Wine function remain
   outside the bridge's counters/lifecycle.

Protocol 3 adds known/unknown game exit status and preserves nonzero exits as
launch failures while normal ownership, health checks, close protection and
restoration continue. The supervisor retains persistent child Unix output in
`game_<timestamp>.log.wine.log` without mixing it into supervisor JSON. Existing
files/symlinks refuse log creation visibly. Flushed bridge records identify
readiness, suspended creation, resume, worker start, resolution/page samples,
changed read values, write begin/result and game exit. Logging does not prove
crash-time page state and introduces observation overhead. No target ceiling,
120/150 exception, delay, manual arming or creation-route workaround was added.

## Next operator checkpoint

Validation used Node 16.20.2 and pnpm 7.33.7: 100 focused tests and all 1,938
Vitest tests pass (reported baseline 1,924), type checking passes, and lint has
the same nine warnings and zero errors. The real Perl supervisor and its model,
direct/Steam native bridge suites, native close protection, production Native IO
fixtures with normal exit and detached descendants, and Steam tamper rejection
pass with isolated harmless executables. The production fixture harness now
passes an absolute `--path`, matching packaged `NL_PATH`; its earlier relative
path failure and all earlier failed checks remain in the evidence directory.
The tests exercise abnormal game exit before any worker generation, persistent
Unix output, unavailable/changing exit status, descendant ownership, restoration,
and non-overwriting log creation. No real game was operated.

Run **one enabled-60 development attempt**, Steam Patch on and Launch Fix/block
hosts off, using the same game, DXMT, prefix and unchanged development Wine.
Refresh development resources with the pinned Node 16.20.2 / pnpm 7.33.7
`start-hk4eos` command only when ready to operate; this includes protocol 3.
Do not substitute the working per-game Wine or install the offline candidate.
Record whether the game reaches login, any numerical HUD value, and exact crash
or normal-exit time. If login remains stable for 30 seconds, quit normally.
On failure, stop after that attempt; do not retry or force cleanup.

Preserve the full launcher log, this run's `.log`, `.steam.log`, **`.wine.log`**,
DXMT output, new dumps/error logs and the exact request-directory names before
another attempt. Record final generation, write begin/end records if any, game
exit code and every cleanup acknowledgement. Retain any unresolved mailboxes or
journal. A pre-worker failure with game DXMT 60 favors the enabled creation context;
a later matching data-page fault following a confirmed write raises the Wine lead.
A pass is one result, not general acceptance. Packaged-game testing is a separate,
still-unrun gate. Native Fullscreen and Game Mode are outside this work.
