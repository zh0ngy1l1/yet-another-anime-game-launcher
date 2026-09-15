# Global installation and cleanup — 2026-09-15

The user subsequently authorized installation and cleanup, retaining only the
working Global application and development scaffolding. The installed app is
`/Applications/Yaagl OS.app`, built from
`30f0d7f509f5caba89ce3f13a79a2270b438811b`. The preceding Step 8 report commit is
`b96edc96a899ad4b681f799534f12093a3ac20f4`; its separate Global/China builds and
longer isolated qualification remain historical evidence.

## Startup correction

A post-cleanup Finder launch exposed a slow startup metadata path. Sophon fetched
an 8,526,970-byte game manifest only to calculate a download total already present
in the small public build response. One request took approximately 103 seconds,
exceeding the existing 90-second native startup watchdog.

The correction reads the validated game summary, requiring a successful response,
matching version, exactly one game entry and a positive decimal compressed size.
The observed total, 121,313,081,970 bytes, matches the previous non-deduplicated
calculation. Installation, update and repair still obtain their full manifests.
The watchdog and downloaded-artifact integrity checks remain intact.

The normal build command rebuilt all components and verified 531 bundle files,
16 ASAR members, bundled dependencies/signatures and four xdelta codec round trips.
This follow-up build used ordinary public caches; the earlier empty-cache,
fresh-checkout proof remains attached to source `7f18d09`. Seven new Python tests
cover the metadata validation and actual startup task with an unavailable manifest
CDN. All 2,049 Vitest tests, type checking, formatting and lint passed; lint retains
the same nine existing warnings. Lockfiles were unchanged.

## Installed application test

The existing account, settings, prefix, Wine and DXMT were preserved in the Global
default profile, `~/Library/Application Support/Yaagl OS R2`. The game remained in
its existing location. Tests used the installed application's normal Finder entry
point and Launch Game button, Steam Patch ON, Launch Fix OFF, DXMT 0.80.0 and
unlocking enabled at target 150. No runtime directory override was used.

| Check                         | Result                                                                                                                  |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Finder startup                | Complete launcher shown once; correct title and current game metadata                                                   |
| Runtime preparation           | New private R2 copy selected after the complete receipt was committed                                                   |
| Saved-account login and world | Passed; world captured at 04:21:57.991 UTC, sampled HUD 126.67 FPS                                                      |
| FPS worker                    | 1,356 successful reads and four successful writes; target 150                                                           |
| Ordinary close                | Posted at 04:22:49.644 UTC, 51.65 seconds after captured world entry; retained game exit 0 at 04:22:51.797              |
| Owned completion              | Worker complete, game/Steam jobs empty, shim exited, bridge released, supervisor status 0, three Wine waits complete    |
| Restoration                   | All 29 direct paths and two typed registry values match; all 25 journal paths match direct or receipt-derived preimages |
| Final cleanup                 | Private runtime/request removed; application and owned processes ended                                                  |

The close helper was configured for ten seconds; dispatch latency delayed the
actual close to the recorded time. This is a short activation check. It does not
replace or extend the earlier sustained gameplay qualification.

An earlier Finder attempt paused on macOS's Desktop-access prompt. Read-only
process samples showed Wine's server blocked in `open()`. Declining access resumed
the game immediately; the long delay had already triggered the launcher's safe
worker stop. That attempt reached login, then exited through the game menu with
exit 0 and verified restoration. The final repeat above passed with Desktop access
denied and its worker active. No Wine force-kill or file/guard recovery was used.

The final run also retained the previously classified teardown diagnostic: game
Windows PID `011c`, threads `01bc` and `0688`, Wine tick 13156.034, approximately
0.929 seconds before retained game exit 0. Its underlying thread-exception cause
remains unresolved. Completed cleanup does not establish that it is harmless.
The [existing support limits](fps-step8-delivery-20260915.md#support-limits) apply;
there is no new architecture, macOS-version or China gameplay claim.

## Installed identities and retained scaffolding

SHA-256 identities:

| Artifact                           | SHA-256                                                            |
| ---------------------------------- | ------------------------------------------------------------------ |
| Complete installed bundle manifest | `cd3e81a7221277db9af13e06a2460ddabf08b89716c9b9a83b484ab26500bc0f` |
| Native executable                  | `c67e7eabd572ca7c96dd1ab547a67faa0bac8e08e4fb50e95dd1850af6571939` |
| Frontend resources                 | `e9252d927dadb73cc70921ea04b9c98ca3885f6599921caa8f7ee0b7f6ac59b2` |
| Sophon executable                  | `387d1a30b57d0ec411fd0ae9b352ada71d444af0046cd4324b0b5155ace3ecdb` |
| Selected R2 ntdll                  | `eef64f611ae9033261a70f46ec0be38d58823717f14e80331946c6d0cd3c85f7` |
| Final runtime preparation receipt  | `6a8a18cea5452d6a02582fd9559f2640536fbc9d2ed0d0fb7d0727ccf10a943a` |

There is no separately installed R2 deliverable. The app contains the pinned
preparation resources and creates the corrected runtime on each enabled launch.

Cleanup removes duplicate applications including China, disposable profiles,
candidate runtimes, generated builds, old downloads and large redundant evidence.
Both source repositories, legacy uncommitted changes, build/test recipes and
history remain. Verified Git bundles preserve the removed Wine/MacPorts source
trees; compact provenance and compressed activation evidence remain in
`~/Library/Application Support/YAAGL Development`. Game data and the active prefix
are retained. Historical evidence paths are not active installation dependencies.

After cleanup, Finder startup again showed the complete launcher and normal quit
ended its sidecars with the repository's generated build outputs absent. The
observed net space recovery was approximately 51 GiB (55 GB), leaving 210 GiB free.

The active app can be opened directly from Applications. No further manual test
or activation step is pending. For future development, use the documented
[build command](build-macos.md); keep future builds outside Applications until
verified. To replace or roll back the app, quit normally and wait for owned cleanup
first. Keep the current game data and prefix; never reset them as a rollback step.
