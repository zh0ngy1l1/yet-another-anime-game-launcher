# Public Sophon implementation references (2026-09-22)

These are observations of public source, not claims about live Genshin service behavior. No external implementation code was copied.

| Project | Inspected commit | License found |
| --- | --- | --- |
| CollapseLauncher/Hi3Helper.Sophon | `9189e990e2d8ef6a9ee5b3dfd77b41e1874f9cac` | MIT |
| CollapseLauncher/Collapse | `dc47259171794596331dffcf90db85a6ac0415ac` | MIT |
| studiobutter/anime_api | `f8ab2be0dcaf562ec88066db9a5288145dc37368` | No LICENSE file; behavioral/documentary reference only |
| DangoRepo/SophonDownloader | `a731adc7c24908eafbb4edd4018703d3e2047edd` | No LICENSE file; behavioral reference only |

## Full manifests

[Hi3Helper SophonUpdate](https://github.com/CollapseLauncher/Hi3Helper.Sophon/blob/9189e990e2d8ef6a9ee5b3dfd77b41e1874f9cac/SophonUpdate.cs#L285) matches source assets by full relative path, indexes their chunks by decompressed hash and associates target chunks with source offsets. It can generate an update from two ordinary full manifests. YAAGL uses hash plus decompressed size and validates the reused bytes.

[Collapse update integration](https://github.com/CollapseLauncher/Collapse/blob/dc47259171794596331dffcf90db85a6ac0415ac/CollapseLauncher/Classes/InstallManagement/Base/InstallManagerBase.Sophon.cs#L695) appends an explicit old version `tag` to the ordinary source build URL, requests current target data separately, and supports target-manifest download when the source manifest is unavailable. [Dango URL construction](https://github.com/DangoRepo/SophonDownloader/blob/a731adc7c24908eafbb4edd4018703d3e2047edd/Sophon.Downloader/Core/SophonUrl.cs#L156) independently demonstrates the explicit source tag.

## Patch modes

[Hi3Helper patch enumeration](https://github.com/CollapseLauncher/Hi3Helper.Sophon/blob/9189e990e2d8ef6a9ee5b3dfd77b41e1874f9cac/SophonPatch.cs#L235) selects CopyOver when OriginalFileName is empty and Patch otherwise. [CopyOver execution](https://github.com/CollapseLauncher/Hi3Helper.Sophon/blob/9189e990e2d8ef6a9ee5b3dfd77b41e1874f9cac/SophonPatchAsset.Update.cs#L356) checks for HDIFF magic even in CopyOver mode: matching sections require patching against an empty source; other sections are raw target bytes. Metadata alone is insufficient to choose the decoder. [anime_api protocol notes](https://github.com/studiobutter/anime_api/blob/f8ab2be0dcaf562ec88066db9a5288145dc37368/Sophon/Imp.md) describe Copy-Over and Copy-and-Patch-Over. Dango vendors an older Sophon version and should not override the current maintained library for format handling.

## Schemas and packages

[Current full schema](https://github.com/CollapseLauncher/Hi3Helper.Sophon/blob/9189e990e2d8ef6a9ee5b3dfd77b41e1874f9cac/Protos/SophonManifestProto.proto) uses 64-bit file size, chunk offset and chunk sizes. YAAGL's original 32-bit FileInfo.size and DiffFileInfo.size do not safely represent large files. No incompatible new protobuf field was established by this source comparison; live protobuf inspection must establish any other changes.

[Collapse package enumeration](https://github.com/CollapseLauncher/Collapse/blob/dc47259171794596331dffcf90db85a6ac0415ac/CollapseLauncher/Classes/InstallManagement/Base/InstallManagerBase.Sophon.cs#L1075) distinguishes the base game, voice locales, mini-prefixed locales and additional matching fields, retaining category identifiers/names from JSON. Actual required selections must be derived from live target metadata and local content.

[WPF documentation](https://github.com/studiobutter/anime_api/blob/f8ab2be0dcaf562ec88066db9a5288145dc37368/Docs/FAQ.md) identifies Miliastra Sandbox modules. The API is getWPFPackages under hyp/hyp-connect/api, separate from Sophon getBuild. [Collapse WPF properties](https://github.com/CollapseLauncher/Collapse/blob/dc47259171794596331dffcf90db85a6ac0415ac/CollapseLauncher/Classes/GameManagement/WpfPackage/WpfPackageContext.Properties.cs#L135) reads independently versioned wpf_version from config.ini. Package implementation handles an archive, independently of Sophon. [Genshin asset cleanup](https://github.com/CollapseLauncher/Collapse/blob/dc47259171794596331dffcf90db85a6ac0415ac/CollapseLauncher/Classes/InstallManagement/Genshin/GenshinInstall.cs#L186) accounts for plugin, channel SDK and WPF assets as well. Never remove every local file absent from the selected Sophon manifests.

## YAAGL history

- [PR 586](https://github.com/yaagl/yet-another-anime-game-launcher/pull/586), original GI Sophon integration; merged commit `18c9084df4d3c65ba4d33dc20e3737c5d06b6af7` on 2025-10-19. Python REST/WebSocket sidecar and TypeScript integration.
- [PR 755](https://github.com/yaagl/yet-another-anime-game-launcher/pull/755), open; head `f38d9d5996515035f103fd18370eb5307aa43d88`. Reports temporary basename collisions and same-size corruption skipped by download after reliable repair identifies it.
- [PR 727](https://github.com/yaagl/yet-another-anime-game-launcher/pull/727), open; head `84d74061d4765f1daca4b26ee4a52ce2ec8ec6ad`. Reports truncated cache reused by TTL; compressed length and decompressed checksum validation plus atomic manifest caching. Described service samples say manifest.checksum hashes decompressed bytes.
- [Issue 693](https://github.com/yaagl/yet-another-anime-game-launcher/issues/693), missing game executable after interrupted update prevents release detection and repair.
- [Issue 699](https://github.com/yaagl/yet-another-anime-game-launcher/issues/699), manifest parsing failure and empty-version UI crash.
- [PR 718](https://github.com/yaagl/yet-another-anime-game-launcher/pull/718) and [PR 741](https://github.com/yaagl/yet-another-anime-game-launcher/pull/741), missing CN patch endpoint aborts at TODO.
- [Issue 561](https://github.com/yaagl/yet-another-anime-game-launcher/issues/561) was created 2025-05-07 and last updated 2026-06-14. Its announcement must not be represented as proof of a newly introduced September 2026 format change.

## Implementation conclusions

Use current and old-tag full manifests when the live API confirms availability; source reuse is an optimization, target-file hashes are authoritative. Treat patch mode as optional and explicitly isolated if unused. Keep independently staged files and validate all selected target packages before deletion/final metadata. Stream large-file checks, preserve original executables until a verified replacement exists, and use a bounded worker count. Retain external attribution if any MIT implementation is translated/copied; this research was descriptive only.

## Observed Genshin 7.1.0 protocol constraints

The September 22 service inspection returned both target `getBuild` 7.1.0 and
explicit source `tag=7.0.0`, with `game`, `zh-cn`, `en-us`, `ja-jp`, and `ko-kr`
full categories. A legacy patch build was also available; full-manifest updating
does not depend on its availability. These observations are dated, not endpoint
availability guarantees.

- Manifest checksums cover decompressed protobuf bytes. Full assets use 64-bit
  sizes; compressed size and decompressed size are separate checks.
- Four downloaded official chunks established protobuf field 7 as compressed
  MD5 and the 16-hex chunk-ID prefix as compressed XXH64. Field 2 is decompressed
  MD5. Field 6 did not equal compressed XXH64 and remains uninterpreted.
- Inspected patch containers mix `HDIFF13&` sections with raw Copy-Over payloads.
  An empty original filename alone does not distinguish raw content from HDiff
  against empty input. Legacy NAP decoding retains that distinction and verifies
  the complete result before publication.
- BeyondUGC files in the game manifest are mandatory game content. The separate
  WPF ZIP contains `BeyondAssets/BeyondAssistEditor` and has independent version
  metadata. An installed optional editor requires explicit update support;
  never infer that ordinary BeyondUGC files are optional.
- In-game English voice content can reside in Persistent even when canonical
  StreamingAssets target paths are absent. Verified bytes may be reused, but
  full-package updating must preserve game-managed cache markers. The later
  [runtime report](genshin-runtime-validation-20260922.md) records the automatic
  cache transition after launch; deleting Persistent was unnecessary.

Use `scripts/probe-sophon.py` to collect sanitized source/target/patch metadata
and checksum-verified manifests for independent inspection. The
[validation instructions](validation.md) distinguish this read-only collector,
the production updater and the independent saved-manifest verifier.
