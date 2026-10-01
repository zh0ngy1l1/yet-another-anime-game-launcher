# HK4E running-game presentation

The Game Mode host now displays **Genshin Impact** for `GenshinImpact.exe` and
**原神** for `YuanShen.exe`. Both carry the official Genshin desktop shortcut icon
and retain `com.zh0ngy1l1.yaagl.hk4e-game`. The launcher remains **Yaagl OS**.
The private runtime’s internal `YAAGL HK4E.app/Contents/MacOS/wine` path remains
fixed; changing this routing identity would add risk without improving presentation.

## Origin and affected surfaces

The previous name came from both `CFBundleName` and `CFBundleDisplayName` in
`native/wine-game-mode/Info.plist`, embedded in the actual Wine process loader and
copied to its signed application bundle. It had no `CFBundleIconFile` or icon
resource. These metadata identify the application to the Dock, application
switcher, macOS application menu and Game Mode/Game Overlay. The Windows game's
window title is set by the game and passed through Wine; this change does not
rewrite it or rename the Windows executable.

At integrated YAAGL upstream `fc56d843461a313fdc5c19af2a2a47eaf8f2f6ac`,
`src/clients/mhy/hk4e/program-launch-game.ts` invokes the ordinary Wine route;
there is no corresponding dedicated game host or Game Mode metadata. The pinned
Wine 11.0 `loader/wine_info.plist.in` identifies ordinary Wine as **Wine** with
`org.winehq.wine`. Its mac driver reads icon resources from the Windows executable
(`dlls/winemac.drv/dllmain.c`, `image.c`, `window.c`) and installs them when the
application becomes foreground (`cocoa_app.m`). The custom host remains necessary
for the existing actual-game Game Mode eligibility/ownership design; substituting
an outer cosmetic wrapper would lose that relationship.

| Route | Application metadata and icon behavior |
| --- | --- |
| Game Mode effective, direct or Steam | Selected regional sealed host; official bundle icon is available before Wine reads the PE icon. Wine can subsequently use the game's own icon. |
| Game Mode disabled, direct or Steam | Existing ordinary Wine metadata and PE-icon behavior. No new routing or private runtime is added for presentation. |
| Game Mode saved but native fullscreen disabled | Existing inactive preference behavior; ordinary Wine route. |
| Setup, registry, wineboot, Steam shim, FPS helpers | Ordinary identities; resolved-image/inode/prefix/socket admission still selects only the actual game. |

Retaining ordinary Wine presentation when Game Mode is off preserves upstream's
process model and avoids extending Game Mode-specific routing to unsupported
runtimes. The name/icon fix targets the host responsible for the reported
**YAAGL HK4E** presentation. No fullscreen, cursor, clipboard, FPS, keyboard,
Windows title or cleanup policy changed.

## Assets and trust

`icon-source.json` records the publisher's public
[HoYoPlay game metadata](https://sg-hyp-api.hoyoverse.com/hyp/hyp-connect/api/getGames?launcher_id=VYTpXlbWo8&language=en-us)
and exact official `hk4e_global` shortcut URL, SHA-256 and publisher MD5. The
2026-10-01 snapshot is Paimon artwork with the publisher's sixth-anniversary mark
and footer. It is publisher artwork, not the project's fan-art launcher icon;
its ownership remains with HoYoverse/miHoYo. No game resources are modified.

The developer build extracts the source ICO's 256px PNG, produces smaller sizes
with macOS `sips`, and packages an ICNS using `iconutil`. It builds and signs two
regional host variants with matching external/embedded plists and the same
identifier. Preparation verifies all pinned assets, selects by the already
admitted game executable, relocates only that sealed variant to the existing
fixed host path, and checks the resulting signature and inventory. The request
and child classifier are unchanged. Normal builds/launches use bundled assets;
there is no network icon dependency or launch-time signature rewrite.

The complete documented native build was rerun from the same pinned Wine 11.0,
MacPorts overlay and R2 correction sources. Rebuilt ntdll hashes changed with the
build outputs; this is not a Wine/runtime version update. The previous and new
ntdll source directories and generated `config.h` match. The printable binary
string difference is the build recipe’s configured installation prefix; its
length changes section layout/relocations, so `__text` is not byte-identical. Manifests, loader ntdll
admission hashes, signatures and package checks bind the new outputs together.

## Verification and limits

Run the documented native rebuild in a fresh directory, then:

```sh
python3 scripts/verify-game-mode-assets.py
python3 scripts/test-game-mode-loader.py
python3 scripts/test-fullscreen-preparation.py --runtime /absolute/pinned/wine
python3 scripts/test-game-mode-wine.py --runtime /absolute/pinned/wine
```

The asset verifier checks both regions' source and asset hashes, effective
embedded/external names, stable identifier, icon resource/size, signatures,
architecture and loader ABI. Package verification invokes the same checks on the
packaged source/resource tree and requires frontend pins for both hosts.

The entry fixture checks effective Foundation bundle names and readable icons for
both regions, retaining PID, arguments, environment, working directory, descriptors
and reservations. Its fake `steam.exe` stays ordinary. Missing hosts, wrong ntdll,
foreign requests/prefixes and changed target inodes still fail closed. Seventeen
preparation cases check ordinary/FPS/fullscreen combinations, regional host
selection, sealed icon copying, absence of unselected hosts and admission failures.
The real-Wine non-game fixture exercises resolved image versus misleading command
line, context/handle/exit propagation, R2's protection invariant and normal cleanup.
Existing HK4E launch tests cover direct/Steam and Global/China feature combinations.
These are finite non-game checks, not observations of Dock/overlay activation or
new gameplay acceptance.

The user reported many successful gameplay runs with the previously installed
candidate. This new candidate has not launched a real game. During manual
acceptance, check the Dock, Command-Tab, menu/Game Overlay name and icon, the
unchanged Windows window title, Game Mode activation in native fullscreen, and
normal quit/cleanup. Test the routes/settings actually used; ordinary Wine naming
with Game Mode off is expected. macOS may retain presentation caches or its
per-game Game Mode preference because the stable bundle identifier is preserved.
