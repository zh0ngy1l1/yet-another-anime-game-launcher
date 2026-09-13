# Direct Steam creation candidate, September 13, 2026

The candidate corrects a demonstrated difference in enabled process creation:
the unchanged signed Steam shim now creates the actual game, and the bridge
retains that child's validated process HANDLE. The previous route made Steam
create a relay and independently created the game with a selected-parent
attribute. Fixture regression proves those routes are observably different.
**Resolution of the real-game crash and achieved FPS remain unverified.**

## Preserved current state and strongest diagnosis

Started clean at `27ee9038b5edc5c9e1d57c8414f1fc7c51054cc3`. No newer game
attempt or collector capture was found. Full current logs, crash artifacts,
exact retained-path inventory, selected settings, artifact identities and
original documentation were preserved before editing in:

`/Users/david/Library/Application Support/YAAGL Local Builds/fps-creation-review-20260913T190131Z`

All 37 copied evidence files were stable and rehashed. Latest run remains
`game_1789322974126.log`, request
`649c1f37f3ced6288aa100a5d9a0f8decf5fc92175b49a9887d572ec0e8f309d`.
The stored FPS setting is now false with target 60, Steam Patch true, and absent
block-hosts setting (default false). This setting change is not a new disabled
run. Game 7.0.0, selected original Wine ntdll.so, native runtime and signed Steam
artifacts retain the identities in the [canonical-60 report](fps-canonical60-investigation-20260913.md).
Existing authorization, lockfiles, commits, legacy modifications and prior
packages remain preserved. No real game was started or live prefix/runtime
modified by this work.

The canonical run's timeline remains: bridge 14:09:40.359 EDT; canonical shim
PID 200/relay 208 ready .695; game PID 224 created/resumed .754; driver failure
14:09:49.896; game exit c0000005 .962, generation 0. Game/Steam jobs drained,
release was acknowledged, supervisor reaped, both Wine waits completed,
registry restoration acknowledged, and file/journal cleanup completed
14:09:59.115. Cleanup is confirmed by those logs; deleted snapshots cannot
independently re-prove every original restored byte.

New exact-runtime analysis resolves the driver failure more narrowly:

- The selected prefix and distribution ntoskrnl.exe/services.exe/kernelbase
  copies match. HoYoKProtect.sys matches the game copy. Its missing WDFLDR.SYS
  import makes module loading fail **before DriverEntry**. Exact ntoskrnl code
  returns c0000142, mapped by Wine to 1114, matching game driverError.log.
- The earlier access 0x34 / required 0x10000 is a **DeleteService** access check,
  not insufficient rights on the game's process HANDLE. The service target is
  not logged and must not be invented.
- The later exception is a **write to 0x1000 at IP 0x6ffffd9b33d8**. Current
  module mapping, instruction bytes, stack memory/call stack and page protection
  are still absent. Prior dump bases do not establish a current relocation.
  Driver failure causes this attempted driver's initialization failure; whether
  it causes the subsequent game exception remains unproven.

The historical Wine correction remains a separate mechanism: game data-page
reads failed after FPS writes, with current/allocation protection disagreement
in downstream NtWriteVirtualMemory. Current generation 0 excludes this bridge's
FPS worker execution in the canonical attempt. It excludes neither other code's
writes nor the selected Wine's established later-write hazard. The previously
prepared revision-2 offline candidate remains separate; no Wine replacement,
resigning or historical deployment script was performed.

Ranked explanations remain (1) enabled creation context affecting game/protection
startup, (2) a common current game/Wine failure if a fresh disabled control also
fails, and (3) other enabled differences including job membership. DXMT maximum
was already 60 in the canonical failure, and the worker never started. The old
Wine FPS-write hazard is not an established cause of this pre-worker write fault.

## What fixtures established and the implementation

Exact current bridge and signed-shim GUI/CUI probes show:

| Property                              | Disabled/direct signed Steam | Old enabled relay route                 |
| ------------------------------------- | ---------------------------- | --------------------------------------- |
| Parent Windows image APIs             | canonical Steam              | canonical Steam, same queried paths     |
| Actual child HANDLE retained by Steam | actual fixture process       | relay only; no HANDLE to actual fixture |
| Steam child command                   | actual executable            | private bridge --steam-relay            |
| Game CreateProcess caller             | signed shim                  | bridge with selected-parent attribute   |
| GUI standard handles                  | NULL                         | NUL input and disk output/error         |
| Persistent Unix PPID                  | launchd (1)                  | launchd (1)                             |

The HANDLE relationship is the regression that failed before this correction.
It is not an assertion that the game uses that particular detection method.
Exact Wine ntdll disassembly also shows Unix stdin/stdout lookup in the current
creator while Windows inheritance uses the selected parent. The old bridge's
remote output slot is invalid in its creator table. However both fixture routes
ultimately use /dev/null for Unix stdout due to console detachment; this is not
claimed to cause the game crash. The shim calls FreeConsole after creating its
child, so the old relay route also changed the timing relative to game creation.

The candidate removes relay/rendezvous and selected-parent/remote-standard-handle
creation. Steam receives the exact game command, unchanged cwd/environment and
ordinary game creation flags; the shim itself still starts suspended with bridge
standard-stream capture and job assignment. Full outer-launch equivalence is not
claimed. Game DXMT policy remains 60 at target 60 and 0 above 60.
The worker signature resolution, initialization policy, compare/write loop and
1–360 target range are unchanged. No manual arming, special target, arbitrary
startup delay, error suppression or runtime installation was introduced.

Ownership is explicit, not inferred from a name or PID:

1. Retain the signed shim's creation HANDLE and assign its unnamed Steam job
   before resuming. This owns all supported descendants before any game code runs.
2. Inspect only handle-snapshot entries owned by that retained shim. Duplicate
   candidate process handles, validate the resulting object against expected
   image, parent, creation time and private job, and reject multiple candidates.
   No game PID is opened and no global image-name search chooses the target.
3. Require cumulative Steam-job TotalProcesses exactly two, assign the actual
   game to its nested job, and check the cumulative count again. Because exits
   do not decrement it, an earlier child cannot disappear and authorize a later
   replacement. This also proves no child preceded nested assignment on success.
4. Retain that exact HANDLE permanently for worker reads/writes and exit status.
   Later descendants cannot become FPS targets. Existing job queries, worker
   completion, release, supervisor reaping, Wine waits and exact restoration
   gates remain required. Failed/unknown operations retain the guard.

This changes the identity contract: there is lifetime ownership before execution,
but the bridge obtains the child's HANDLE after creation, without its initial
thread or an authenticated CreateProcess-return handoff. A legitimate eager
Windows descendant before adoption is rejected visibly; no retry selects a
weaker candidate. A missed short-lived child is a failed launch with unknown game
identity, not a successful launch or invented exit code. Its private Steam job
still controls safe cleanup. Same-user privileged tampering, native Unix forks,
pre-existing services and other-prefix handoffs remain outside the guarantee.

Independent review caught and corrected required nested-job assignment access
rights and the new exit-observation race: direct Steam can observe child exit
before the bridge's first poll. The bridge reobserves game exit after the shim signals so
legitimate completion does not masquerade as early shim failure; a matching
known game exit is reported once while distinct shim errors remain observable.

## Validation and delivery

Pinned Node 16.20.2 / pnpm 7.33.7: all **1,947 Vitest tests**, **113 focused
tests**, type checking, lint (nine existing warnings, zero errors) and formatting
pass. Both native bridge suites pass with targets 1/60/61/120/360, unchanged
decoys, actual signed-parent child HANDLE, worker restart after the shim closes
its own handle, post-adoption descendants, eager-child rejection, late creation,
early shim exit and exact registry restoration. The deterministic exit-order
regression passes and its independently mutated version fails as expected.
Native quit/concurrency, real/model supervisor and production native-RPC normal,
descendant and Steam-tamper restoration cases pass. Only isolated fixtures ran.
The read-only collector now anchors a run from .wine.log/.steam.log even when
ordinary GUI output is absent; its filename regression prevents an older
disabled log from anchoring a newer enabled crash capture.

Bridge protocol 3 is 36,864 bytes, SHA-256
`12db0203a736f56b51c424c3ad26d2efbbdae4b5b870b8f62df639b024e182ba`.
Native ARM64 4.11.0-yaagl-owned1 remains 2,004,496 bytes, SHA-256
`3e04ed4a6d2b5389d7dbe525367881a08a5081314ef6dddf973227a66a3857e1`.
Signed Steam and selected Wine identities are unchanged.

Final validation and artifact identities are recorded with this delivery and in
`checks`, `package/bundle-manifest.json` and `package/verification.json` under the
evidence root above. Fixture results establish process/worker/cleanup behavior;
they do not execute Genshin's protection startup or renderer. The actual Global
bundle is `package/Yaagl OS.app` in that root, separate from installed apps and
without profiles, game data or Wine. It includes the matching local native
runtime, bridge, unchanged signed shim, complete Sophon distribution, manifests
and licenses. Its build record explicitly preserves gameplay and runtime limits.

The [manual checkpoint](../NEXT-MANUAL-CHECKPOINT.md) uses the development
launcher for a contemporary disabled control, then enabled 60, then enabled 120
only after prior startup/worker/restoration gates pass. The disabled control
resolves whether the same current game/runtime still works through direct Steam.
Fixtures cannot answer that game-specific question. Failure or unknown cleanup
ends testing immediately. Packaged gameplay remains a separate unrun checkpoint;
packaging and automated tests do not establish successful gameplay.
