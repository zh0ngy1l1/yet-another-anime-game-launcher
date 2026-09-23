# Yet another anime game launcher (Yaagl)

## Build this fork on Apple Silicon

See [the complete macOS build instructions](docs/build-macos.md) for prerequisites,
source/artifact verification and separate Global/China outputs. With the documented
prerequisites installed:

```sh
git clone https://github.com/zh0ngy1l1/yet-another-anime-game-launcher.git
cd yet-another-anime-game-launcher
./build-macos.sh
```

Output: `build/hk4eos/Yaagl OS.app`. This local build uses an ad-hoc signed ARM64
launcher, is not notarized, and requires Rosetta for Intel runtime/helpers.
[FPS settings, automatic R2 preparation, cleanup and rollback](docs/fps-runtime.md)
describe the supported route and finite gameplay evidence.

The upstream installation notes below describe upstream releases; those releases
do not include this fork's R2 delivery changes.


## Validated fork configuration

Genshin Global 7.1.0 updating and authenticated gameplay are covered by the
[updater](docs/genshin-updater-validation-20260922.md) and
[runtime](docs/genshin-runtime-validation-20260922.md) reports. Other game channels
retain their implementations; this does not qualify their current live versions.

## For Linux users
[Anime Games Launcher](https://github.com/an-anime-team/anime-games-launcher) is a universal linux launcher for anime games

## Is it safe?

Use it at your own risk. Or enjoying it with a new f2p account.

## Support

[Our Discord server](https://discord.gg/HrV52MgSC2) is the **ONLY** place providing support if you have any issue just using this application.

**DON'T FILE AN ISSUE** unless it's a technical problem coming with a clear root cause.

> Simply put _My game doesn't launch_ or _I can't login_ without telling any technical detail is not acceptable, please go to the Discord server instead of abusing Github Issues

**DON'T ASK FOR SUPPORT IN OTHER COMMUNITY**, especially the official one.

## Install

- Go to [Release](https://github.com/3Shain/yet-another-anime-game-launcher/releases/latest) and download the latest version.

- Uncompress and copy the resulting application to your `/Applications` folder. (Do not open the application from Downloads folder).

- Also make sure your game files aren't stored inside `/Applications`, use something inside your home folder instead, e.g `Games/GI`.
## Uninstall (completely)
1. Drag app to the bin
2. Delete folder `~/Library/Application Support/Yaagl` or `~/Library/Application Support/Yaagl OS` if you are using oversea version. (For HSR and ZZZ the name of folder is slightly different)

## Related projects

* Custom `neutralinojs` binary from [3Shain/neutralinojs](https://github.com/3Shain/neutralinojs)
* [DXMT](https://github.com/3Shain/dxmt)
* Custom Wine from [anime-game-wine](https://github.com/yaagl/anime-game-wine)

## Special thanks
* An Anime Team
* Krock, the game running on macOS can not come true without his patch (you can find the link to his work in this repository, while you have to make a little effort ;) )

* mkrsym1, tackled IMO the most challenging AC component. It's a really remarkable and mind-blowing achievement.
