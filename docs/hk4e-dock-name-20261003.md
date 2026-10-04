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

Verification and installation results will be recorded after the committed-source
package has completed controlled real-game launches and installation.
