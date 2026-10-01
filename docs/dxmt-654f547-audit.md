# DXMT 654f547 artifact and compatibility audit

Inspected on 2026-09-30 without starting a game or modifying a live prefix.
This records artifact and source checks, **not gameplay qualification**.

## Download and installation layout

The integrated upstream resource version is the literal string `654f547`,
identifying DXMT commit `654f547ffab4e0c395ee368aad52bb4586b04576`.
The [public ZIP](https://github.com/yaagl/anime-game-wine/releases/download/dxmt-654f547/dxmt-654f547ffab4e0c395ee368aad52bb4586b04576.zip)
was downloaded successfully into the ignored `.tmp/upstream-sync-audit/` directory.

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `dxmt-654f547ffab4e0c395ee368aad52bb4586b04576.zip` | 32603639 | `fbc0721fb72ebafd2bad0dbdd3d13a52056fd10c4a9a699cee2689363823255b` |
| Enclosed `dxmt-654f547ffab4e0c395ee368aad52bb4586b04576.tar.gz` | 32758021 | `ceb4a8b83477b35f5d56e266e9ce278807f10bc11e6603a7346430628e123550` |

The ZIP contains only that TAR archive. Its root directory is the full commit
identifier. The launcher selects `x86_64-windows/` and `x86_64-unix/`; the archive
also contains i386 and aarch64 directories. Flattening the selected directories
into `dxmt/` yields these real files:

| Source directory / file | Bytes | SHA-256 |
| --- | ---: | --- |
| `x86_64-windows/d3d10core.dll` | 1542829 | `121f2bb8f6e03aa07d75ab1693405588da9b720eb45ea1676ce38aa258e83ee0` |
| `x86_64-windows/d3d11.dll` | 5518751 | `fbb95116abaf69a55495fcffc8956bcfbe2b815f3862e44a01d18329bf668739` |
| `x86_64-windows/dxgi.dll` | 1912783 | `619cd3ef61e5b86eb3913700f2db385639610053379b7ae1a5888cba9eaede3c` |
| `x86_64-windows/winemetal.dll` | 74373 | `8055c7532ffa1afdd5c2de514e01d5fa564c0adf0afa3abe400d0e678cfac8e1` |
| `x86_64-windows/nvngx.dll` | 1587111 | `168dd9a186ea908fa509385d5779207cc591d69189c1c0896807d7d1cec3a8fa` |
| `x86_64-windows/nvapi64.dll` | 1945258 | `fdfb7dc5725c96b82be0b3f9dd1b82cb4a013ee236bb017675e3fd106ad4fbd8` |
| `x86_64-unix/winemetal.so` | 31877808 | `2d6966b5b445c781eff2d2b180208a8c5c0679b147f6d963180f28b11520bcdd` |

`file` identifies all six DLLs as x86-64 PE and `winemetal.so` as an x86-64
Mach-O shared library. All files consumed by `src/clients/mhy/patch.ts` are
present: three D3D/DXGI DLLs, both winemetal files, and HSR's `nvngx.dll`.
The extra `nvapi64.dll` is retained by upstream acquisition but has no current
launcher installation call site. No separate graphics archive is needed.

An existing `installed_dxmt_version=0.80.0` differs from `654f547` and must
reacquire/extract this ZIP and TAR before recording the new version. A matching
version must only be reused when its required files exist. Acquisition is
separate from copying these files into Wine/prefix locations during launch.
The hashes here are measured provenance, not an assertion that the downloader
performs checksum validation.

## FPS and native runtime interaction

Compared the [new configuration parser](https://github.com/3Shain/dxmt/blob/654f547ffab4e0c395ee368aad52bb4586b04576/src/util/config/config.cpp)
with the [v0.80 source commit](https://github.com/3Shain/dxmt/blob/589adb780354b461645b29999cefaf533594ee99/src/util/config/config.cpp).
The only difference is an unrelated Helldivers 2 built-in setting; parsing,
whitespace handling and assignment precedence are unchanged. The new file's
SHA-256 is `59530aab6172e15c2fa0a0732caf8730a2e2d9f36988d4beb6d8bb2745033b6a`.

The complete [D3D11 swapchain source](https://github.com/3Shain/dxmt/blob/654f547ffab4e0c395ee368aad52bb4586b04576/src/d3d11/d3d11_swapchain.cpp)
is byte-identical to v0.80: SHA-256
`7afae62c7b6d4e7ead2e0d4190a88dcfe4d19706d98a065e74e83f2dd62f3f68`.
It still reads `d3d11.preferredMaxFrameRate`, defaults to zero, and uses that
value in presentation timing. This supports retaining the fork's FPS config
adapter and disabled/default behavior. It does not establish achieved FPS.

`otool -L` shows that `winemetal.so` depends on Wine's `@rpath/winemac.so` and
`@rpath/ntdll.so`, along with system libraries/frameworks. The
[winemetal Wine interface](https://github.com/3Shain/dxmt/blob/654f547ffab4e0c395ee368aad52bb4586b04576/src/winemetal/unix/winemetal_unix.c)
retains the same `macdrv_win_data` prefix and `macdrv_functions_t` table as
v0.80. The packaged fullscreen driver exports `macdrv_functions`; the Game Mode
ntdll exports the directly imported `NtSetEvent` symbol. These are static
compatibility checks, not a rendered-frame or fullscreen test.

The R2, fullscreen and Game Mode manifests pin Wine loader, ntdll and winemac
components. They do not pin DXMT files, and this upgrade changes none of those
inputs. Keep their existing hashes and validation. The HK4E file journal still
owns graphics installation into the request-private runtime and prefix, and
restoration still precedes private-runtime disposal. ReShade acquisition must
retain deferred configuration for the journaled route.

## Platform and qualification limits

`otool -l` reports macOS **15.0** minimum and SDK 15.1 for the downloaded
`winemetal.so`; `codesign --verify` reports that it is unsigned. Both facts also
hold for the exact [old v0.80 public archive](https://github.com/3Shain/dxmt/releases/download/v0.80/dxmt-v0.80-builtin.tar.gz),
downloaded independently during this audit. That archive's SHA-256 is
`8f260e36b5739e68f3bad613381441385c4dc7b85b78ba8de653d5a6a264529d` and its
`winemetal.so` SHA-256 is
`3d50d7f39c64778c71d0af2fce1cde818d09ffbce7c4f7b8ae24ae1df567c0ca`.
These are pre-existing graphics distribution limitations. The launcher's macOS
14 minimum and Game Mode capability gate do not establish graphics compatibility
on macOS 14. No signatures, runtime pins or OS gates were weakened in this audit.

DXMT's [source comparison](https://github.com/3Shain/dxmt/compare/589adb780354b461645b29999cefaf533594ee99...654f547ffab4e0c395ee368aad52bb4586b04576)
contains 239 commits after v0.80. Earlier game/FPS/fullscreen/Game Mode reports
qualify their recorded v0.80 combination only. The upgraded graphics combination
still requires world entry, usual FPS settings, green-button fullscreen, Game
Mode activation, windowed geometry restoration, normal cleanup and relaunch.
This audit did not execute Wine, a graphics fixture or a game.
