# HK4E Dock filename correction — 2026-10-03

The validated hashing candidate (`5f1cff9`) still showed **YAAGL HK4E** when
hovering the running Global game’s Dock icon. A controlled launch reproduced it
on a fresh private runtime: the same actual Wine game process had localized
name **Genshin Impact**, stable identifier `com.zh0ngy1l1.yaagl.hk4e-game`, and
bundle path ending in `YAAGL HK4E.app`. No game tile existed before that launch.
The tooltip therefore exposed the remaining bundle filename; the October 1
metadata and running-process checks had not established Dock hover success.

The signed host is now `Genshin Impact.app` for Global and `原神.app` for China.
Routing selects the path from the already admitted resolved executable; each
host rejects the wrong regional location/target. Preparation validates the exact
regional mapping and encodes JSON asset names as UTF-8 filesystem bytes before
copying and comparing full inventories, including non-ASCII asset parent paths.
Packaging reads NUL-delimited Git paths so Unicode filenames are not C-quoted. Build, manifest, signatures, asset checks
and relocated-host fixtures use the same names. The stable identifier, external
and embedded display names, official icon, request format, ownership checks and
ordinary Wine helper route remain. No Dock/Launch Services database was reset.

The native assets were rebuilt through the pinned Wine 11.0 recipe, including
plain/R2 ntdll identities bound to the rebuilt loaders. Fullscreen, input,
geometry, FPS policy, process supervision and cleanup implementation are unchanged.

## Verification and installation

Continued `fix/hk4e-presentation-launch-prep-20261001` from `86d6c80`.
Implementation and signed assets: `5bde65d`, `9aec8cf`, `9fb0e1d`.
The installed package was built from committed source
`9fb0e1ddbfc37ca8b3fb3ced61ae91f0a30b9074` using Node 16.20.2 / pnpm 7.33.7.
The subsequent `eb16d48` changes only the package verifier to recognize the
Unicode escapes retained by raw JSON imports; it does not change app bytes.

Checks passed: TypeScript, Prettier, ESLint (nine existing warnings, no errors),
40 Vitest files / 2,202 tests passed with one existing optional skip; native asset
hashes, matching embedded/external regional plists, icons, signatures and ABI;
regional loader probes preserving PID/argv/cwd/fds and rejecting old/wrong host
names; all 18 preparation cases, including Unicode asset parents and swapped
regional mappings; real Wine non-game child routing, R2 protection behavior and
ordinary completion. The complete package verifier passed all **562 files** and
**four xdelta codec round trips**.

On Apple Silicon/macOS 26.6.2, three corrected real-game launches used the existing
Global configuration: Steam Patch, native fullscreen and Game Mode enabled;
FPS unlocking, Retina and Metal HUD disabled. No settings experiments were used.

| Launch | Actual Dock hover | Runtime and completion |
| --- | --- | --- |
| Validated old candidate | YAAGL HK4E | Fresh old-named host; normal exit/cleanup |
| Corrected staging, first | Genshin Impact, existing correct icon | Fresh regional host; native fullscreen; macOS overlay **Game Mode On**, corroborated by gamepolicyd; normal exit/cleanup |
| Corrected staging, repeat | Genshin Impact, existing correct icon | Different freshly prepared runtime after the first was removed; normal exit/cleanup |
| Installed launcher | Genshin Impact, existing correct icon | Launcher startup and third fresh game runtime; normal exit/cleanup |

The corrected Dock AX URLs agree with each actual game's NSRunningApplication
bundle path. Hover screenshots establish the visible label; plist/process names
alone are not counted as Dock verification. Every run completed Wine wait,
registry/file restoration, journal cleanup and private-runtime removal before
quitting its launcher. All **22 settings files** retained their exact bytes and
modes. No existing user game session was interrupted.

Installed: `/Applications/Yaagl OS.app`, verified against the complete candidate
inventory before and after installed startup and game exit. One fresh, verified
rollback remains at `/Applications/Yaagl OS.rollback-20261003.app`, retaining the
previous installed source `f00f01cdb5cc8fdb4d15b2f052bedb679dd73443`.

Removed the `Yaagl OS.app` bundles under `build/launch-polish-20261001`,
`build/launch-hashing-20261001` and `build/dock-name-20261003`, the failed disposable
packaging directory, and the temporary duplicate of the replaced installation.
No older redundant launcher backups remained. Total removed: **448,655,558 logical
file bytes**; this is not a physical APFS reclaim claim. Mixed-content build
parents and their manifests/verification records remain. Source/worktrees,
tracked native assets, build inputs, profiles, game data and diagnostic evidence
were preserved. An idle Terminal tab inside the old candidate was moved to its
retained parent before deletion; the shell was not terminated. Its normal macOS
Automation approval was accepted under the existing authorization.

Raw screenshots, process/AX evidence, logs, byte inventories and the exact deletion
list remain local in ignored `.tmp/dock-name-20261003/`. No Dock or Launch Services
reset was performed. China has native/preparation/real-Wine fixture coverage,
not an actual China game Dock-hover test. These brief Global runs are not a new
all-settings or extended-gameplay qualification. Main and the separate assessment
and prototype branches were not changed; delivery is limited to this feature branch.

