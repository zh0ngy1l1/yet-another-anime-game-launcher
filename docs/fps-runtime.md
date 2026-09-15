# FPS unlocking: operation and recovery

Enable **Enable unlocking** in settings and set **Target FPS** to an integer
from **1 through 360**. Changes persist. Invalid enabled input prevents launching;
turning unlocking off preserves the stored target and other saved choices.

The qualified route is direct HK4E Global, Wine 11.0 DXMT signed with patches,
DXMT 0.80, **Steam Patch ON**, **Launch Fix (block hosts) OFF**. China builds are
separate; China gameplay is unrun. Launch Fix has fixture/integration coverage,
but these gameplay runs do not establish real host-blocking compatibility.

## Delivered runtime behavior

On an enabled launch, YAAGL waits for the selected prefix's Wine server, verifies
the selected loader/server and ntdll, and makes a unique private APFS runtime copy.
It applies only the exact pinned R2 delta, checks the complete resulting hash and
signature, and records copy provenance before selecting it. Unexpected bytes
stop the enabled launch before game changes. There is no fallback to affected
Wine. The installed runtime, selected prefix, backend and environment remain intact.

R2 ntdll SHA-256:
`eef64f611ae9033261a70f46ec0be38d58823717f14e80331946c6d0cd3c85f7`.
The Wine version label alone does not establish this identity. Input pins and
source correspondence are [included in the repository](../native/wine-r2/README.md).
Preparation needs only macOS utilities at runtime; it requires APFS and sufficient
space for an independent runtime copy. It never modifies libraries in use.

With unlocking disabled, no R2 copy or FPS worker is created. The existing Wine
launch path and its ordinary 60-FPS DXMT policy remain in place. Saved choices
are not silently converted to a different backend or target.

Enabled targets up to 60 apply that DXMT limit to the game and worker. Higher
targets remove the game-side DXMT 60 cap and give the requested target to the
worker. Requested policy and measured hardware throughput are different facts.

## Ownership, close and recovery

YAAGL retains ownership of the game, FPS worker, Steam shim/jobs and foreground
supervisor. Normal launcher quit waits for the existing cleanup protocol. A
disappearing window alone is not proof that the game or cleanup has completed.
After owned completion, YAAGL waits for Wine, restores captured registry values
and game/runtime files, then removes private resources and releases the guard.
Primary game/worker errors remain reported even if restoration succeeds.

On interruption or an unresolved lifetime, keep the profile, request, journal and
preparation receipt. Do not force-kill Wine, delete guards, or launch another app
against the same game files. Recovery requires establishing that the recorded
owners have ended before using the existing restoration/retry flow. An abandoned
`fps-runtime/r2-*` directory is never reused automatically. After confirmed owner
completion and restoration, its private copy may be archived or removed; the
installed Wine and game data are not rollback targets.

## Evidence and limits

The 2026-09-14 isolated R2 results include stable enabled-60 login, enabled-120
gameplay around 117–118 FPS, and ten minutes at target 150 with movement and fast
travel, sampled around 110–121 FPS. Those three runs recorded game exit 0,
worker/job/supervisor completion, Wine waits and restoration. See the
[dated report](fps-r2-game-validation-20260914.md) for exact artifacts and capture
qualifications. Earlier unrun statuses remain historical, not current results.

The final [Step 8 delivery](fps-step8-delivery-20260915.md) also passed normal
fresh runtime acquisition/preparation, enabled-60 prelogin, an existing-runtime
disabled control and enabled-150 world observation for 13 minutes including fast
travel and late successful write/readback. All recorded game exits were 0 and
owned cleanup/restoration completed. Sampled world throughput was 120–130 FPS.

The later [Global installation check](global-installation-20260915.md) passed
Finder startup, saved-account login, world entry and normal close in Applications.
On first Finder launch, Wine can trigger a macOS folder-access prompt. Resolve
the visible prompt before continuing; a long unanswered prompt can stop bridge
progress and cause the launcher to stop its worker safely. Desktop access was
declined in the tested configuration because the game is stored elsewhere.
After the interrupted attempt closed and restoration completed, the repeat
launch passed with the worker active. Do not grant broad disk access as a workaround.

These finite observations do not establish universal crash-free operation.
Process-tagged final logs identify a Wine thread-abort diagnostic inside the game
during ordinary teardown, shortly before its retained handle reports exit 0.
Worker/jobs, supervisor, Wine waits and exact restoration also confirm completion.
The thread exception's underlying cause remains unresolved; it is not classified
as harmless. See the delivery report for exact process, timing and exit evidence.

The application requires macOS 14+; actual qualification is on Apple Silicon
macOS 26.6.2 with Rosetta. Earlier OS gameplay, Intel-native application builds,
China gameplay, higher graphics loads and arbitrary Wine distributions remain
outside the finite tested configuration. Native Fullscreen and Game Mode are
outside this delivery.
