# Genshin Sophon protocol investigation — 2026-09-22

This investigation starts from fork commit `f843d493878fc5ddc544311f3b83ac40f630438f`, branch `main`, with a clean working tree. All reads of `/Users/david/.gimpact` are read-only. Downloads, decoded manifests and generated Python modules are under `/tmp/yaagl-sophon-investigation`; credentials remain in memory and are redacted before saving API responses. TLS verification is enabled with the certifi CA bundle.

## Directly observed baseline

The installation identifies as global (`os`): `GenshinImpact.exe` exists, and `config.ini` has `channel=1`, `cps=mihoyo`, `sub_channel=0`. The version anchors disagree: **config.ini says 7.0.0; globalgamemanagers embeds 7.1.0**. The directory was already partially updated before this task. `Persistent/audio_lang_14` selects only `English(US)`.

A pre-investigation stat inventory records 3,846 files totaling 153,516,760,500 bytes, including cached `.tmp` and `ldiff` files. The inventory is `/tmp/yaagl-sophon-investigation/original-inventory.json` (relative path, size, modification time, inode, mode). Initial SHA-256 provenance:

| Asset | Bytes | SHA-256 |
| --- | ---: | --- |
| config.ini | 77 | `71ab26b3d5dee59d47a7d80afdb80343f8d8d3a1c6d446939e1cb8155d8bb38b` |
| GenshinImpact.exe | 444260776 | `08a3086d5f3fe695f01dab61efa42e442006b18e5e475b2520df356f6a073b7d` |
| GenshinImpact_Data/globalgamemanagers | 1974028 | `c1b2d1355ab65f36f51ab9b538957baadd8009fa4f94be78a49f77015424b890` |
| GenshinImpact_Data/Persistent/audio_lang_14 | 11 | `98a8821bac3ede21bdda7a7a000ff423a51ceb98ec0f9e9cfdcff4f4f6541296` |

## Live API evidence

Requests used the global launcher ID `VYTpXlbWo8`, game ID `gopR6Cufr3`, and verified HTTPS. Password values and URL queries containing authentication are intentionally omitted.

| Request | HTTP / retcode | Observed result |
| --- | --- | --- |
| `sg-hyp-api.hoyoverse.com/hyp/hyp-connect/api/getGameBranches` | 200 / 0 | main target `7.1.0`; package `ScSYQBFhu9`; branch `main`; diff tags `7.0.0`, `6.7.0` |
| `sg-downloader-api.hoyoverse.com/downloader/sophon_chunk/api/getBuild` | 200 / 0 | target tag `7.1.0`, build `sMXGW2ll3Fuu` |
| ordinary `getBuild` with explicit `tag=7.0.0` | 200 / 0 | **source tag `7.0.0` returned successfully** |
| POST `getPatchBuild` with empty body | 200 / 0 | tag `7.1.0`, build `sMXGW2ll3Fuu`, patch `t663grrK4Of4`; transitions include `7.0.0` and `6.7.0` |

Every build has five manifest categories: `game`, `zh-cn`, `en-us`, `ja-jp`, `ko-kr`. Branch metadata calls `game` `CATEGORY_TYPE_RESOURCE`, other categories `CATEGORY_TYPE_AUDIO`; all are `CATEGORY_SCENARIO_FULL`. There is no separate modular/WPF category in these ordinary build responses. The separate WPF endpoint is described below.

Build schemas contain `build_id`, `tag`, `manifests`; patch build also contains `patch_id`. Categories carry `category_id`, `category_name`, `manifest`, `matching_field`, `manifest_download`, `chunk_download` (or `diff_download`), `stats`, and full builds additionally `deduplicated_stats`. Download metadata contains `encryption`, `compression`, `url_prefix`, `url_suffix` and a redacted password field. Current full chunks/manifests use compression=1, encryption=0; diff payloads use compression=0, encryption=0. `url_suffix` is empty in the observed responses.

The ordinary source and target builds directly establish that a full-manifest delta update is available; `getPatchBuild` is not required to construct the target set. They do **not** yet prove that a complete updated installation has been produced.

## Manifest and payload observations

All 15 source, target and patch manifests returned HTTP 200 and decoded successfully. Their published checksums match MD5 of the **decompressed protobuf**, not the downloaded Zstandard bytes. Full build manifests contain only flags=0 in this sample; directory handling still belongs in a general implementation. No file currently exceeds 535,488,352 bytes, so the existing int32 declaration did not overflow in this live sample. A 64-bit declaration is needed for general large-file support.

| Category | Source files / chunks | Target files / chunks | Target uncompressed bytes |
| --- | ---: | ---: | ---: |

| game | 2,673 / 107,500 | 2,744 / 113,610 | 131,981,846,376 |
| en-us | 175 / 15,053 | 177 / 15,565 | 18,305,745,675 |
| zh-cn | 175 / 11,644 | 177 / 12,069 | 14,095,405,662 |
| ja-jp | 175 / 13,660 | 177 / 14,154 | 16,618,140,586 |
| ko-kr | 175 / 12,158 | 177 / 12,623 | 14,803,162,467 |

## Commands and artifacts

The initial metadata probe ran:

```sh
python3 -m venv /tmp/yaagl-sophon-investigation/venv
/tmp/yaagl-sophon-investigation/venv/bin/pip install zstandard protobuf grpcio-tools xxhash certifi
mkdir -p /tmp/yaagl-sophon-investigation/proto
/tmp/yaagl-sophon-investigation/venv/bin/python -m grpc_tools.protoc -I sophon_server --python_out=/tmp/yaagl-sophon-investigation/proto sophon_server/manifest.proto sophon_server/manifest_ldiff.proto
/tmp/yaagl-sophon-investigation/venv/bin/python -u /tmp/yaagl-sophon-investigation/probe_builds.py
/tmp/yaagl-sophon-investigation/venv/bin/python -u /tmp/yaagl-sophon-investigation/probe_manifests.py
```

`probe_builds.py` constructs authenticated URLs in memory, saves only sanitized JSON, and catches request errors without printing URLs. `probe_manifests.py` downloads manifest metadata only. The system initially had approximately 185 GiB available; measured update estimates and successful APFS clone preparation are recorded below.

## Chunk identity and previously ignored fields

Every chunk in both full manifests has an unknown length-delimited protobuf field 7. Four actual official chunk downloads established that field 7 is the **MD5 of compressed bytes**. The existing schema omitted it. The manifest's field 2 is the decompressed MD5. Chunk IDs have `16hex_32hex` form: the first part equals compressed XXH64; the second part equals decompressed MD5 in all four samples.

One nontrivial sample is the first `GenshinImpact.exe` chunk:

| Property | Observed value |
| --- | --- |
| HTTP | 200 |
| chunk ID | `616e6fbbf0a97dc9_a21a4420161bca81a78f73b27bfa359a` |
| compressed size | 422151 |
| compressed XXH64 | `616e6fbbf0a97dc9` |
| compressed MD5 and field 7 | `6724658dc7220be7f148bfe12be51ed5` |
| decompressed MD5 and field 2 | `a21a4420161bca81a78f73b27bfa359a` |
| field 6, currently named xxhash | `0xc6dc4257f9c00000` |

**Field 6 is not the compressed XXH64 in this observation.** Its semantics remain unverified and must not be used under the current schema comment's assumption. It is nonzero for 112,781 target game chunks and zero for 829. The three other downloaded samples (`APMConfig.json`, `vk_swiftshader_icd.json`, `PC.manifest`) independently confirm field 7 and ID-prefix hashing; their field 6 values are zero.

The original parser also ignores API `deduplicated_stats`, download compression/encryption controls, URL suffixes, and branch category type/scenario information. Current metadata does not require encryption or a nonempty suffix. The patch protobuf contains no unknown fields in all five sampled categories. Those observations do not rule out future fields or different region/package behavior.

## Patch-format failure established from real bytes

The game patch manifest contains 1,152 entries for source `7.0.0`: 1,070 have named old files; **82 have empty original names, original size zero, and patch subsection length exactly equal to target size**. The latter are full Copy-Over sections. Existing cached containers allowed read-only header inspection of 1,142 sections: 1,070 begin `HDIFF`, 72 do not; ten Copy-Over sections had no complete cached container. The remaining entries in the 2,744-file patch manifest do not all require a patch for this source version.

Eight independent official range requests returned HTTP **206**, and bytes agreed with cached subsection headers. Representative cases:

| Target path | Offset / section bytes | Header | Evidence |
| --- | ---: | --- | --- |
| `GenshinImpact_Data/StreamingAssets/AssetBundles/data_revision` | 43718478 / 29 | `HDIFF13&` | Genuine HDiff section, old and target sizes both 8 |
| `GenshinImpact_Data/StreamingAssets/APMConfig.json` | 22311285 / 32 | `HDIFF13&` | Genuine HDiff section, old and target sizes both 105 |
| `GenshinImpact_Data/Plugins/libHttpClient.GDK.dll` | 3561003 / 249256 | `4d5a9000` (`MZ`) | Raw PE executable bytes, empty original name; entire cached section MD5 equals target `cebc704824d361b8fe34b2ceaed0c810` |
| `GenshinImpact_Data/StreamingAssets/AssetBundles/blocks/00/04658409.blk` | 3153 / 1740190 | `426c6203` (`Blb` plus version byte) | Full-sized raw asset payload, empty original name |

For the DLL, the HTTP content range was `bytes 3561003-3561066/74591293`. For `data_revision`, it was `bytes 43718478-43718506/53017662`. Only tiny ranges were downloaded for this test. No patch was applied to the original installation.

The baseline code unconditionally extracts selected subsections and invokes `hpatchz`; the DLL above is demonstrably not an HDiff stream. This is a concrete protocol mismatch. A missing raw-copy target can happen to be routed into full-chunk download by `_download_ldiff_file`, but this incidental fallback does not make the unconditional patch path valid in general. A robust implementation must either discriminate formats and verify the result or use ordinary full manifests without this patch dependency.

The same baseline has additional independent correctness hazards: staging by basename; skipping same-size files before hashing even when reliable repair selected them; replacing a file after a failed patch hash; deletion before target completion; update/repair loading only the `game` category; early version writing during install; and whole-file `read_bytes()` hashing. These are code observations, not claims that each hazard caused the current user's previous partial update.

## Required assets and separate WPF package

The ordinary target game manifest includes the executable and runtime/security assets, including:

| Asset | Target bytes | Target MD5 |
| --- | ---: | --- |
| `GenshinImpact.exe` | 444260776 | `f69da59bdc366df20bd2b598700e9370` |
| `GenshinImpact_Data/globalgamemanagers` | 1974028 | `34bcf8fe94b6464d47578b40bee0411c` |
| `HoYoKProtect.sys` | 4513984 | `cd6c4040c074d7da17dead0f2f75e500` |
| `mhypbase.dll` | 27423608 | `468631aa130f4264797663acce953bb5` |
| `rtlbase.dll` | 5538272 | `64ce90a461c2c336ff1df90d6b3bc008` |

It also contains 26 paths with `Beyond` in their names, including BeyondUGC audio and two Beyond backstory videos. These are ordinary mandatory game assets, not a sixth Sophon manifest category.

The separate global `getWPFPackages` endpoint, queried with the same launcher ID, returned HTTP 200 / retcode 0 and one `hk4e_global` package:

- Version `7.1.0.48145775`.
- File `BeyondAssets_OS_7.1.0.48145775.zip`, 492,903,256 bytes.
- Published ZIP MD5 `5a2942cea4082fc00c8995232b136b23`.

Range-reading its ZIP central directory used just 713,505 bytes across three HTTP 206 requests. It lists 4,859 files totaling 491,554,052 bytes: `beyond_pkg_version` and 4,858 paths below `BeyondAssets/BeyondAssistEditor/`, including an editor executable and .NET/WPF runtime DLLs. Neither that directory nor `beyond_pkg_version` exists in the original installation. There is therefore no evidence of an installed WPF editor package to preserve in this user's update. Ordinary BeyondUGC content remains included via the game manifest. The endpoint does not by itself prove whether the editor is mandatory for launching some optional in-game feature.

## Complete read-only audit of the existing installation

A bounded streaming MD5 audit with **two workers** compared every selected target file against target and source metadata, finishing in 80.47 seconds. Category details are significant:

| Category | Already matches target | Matches source only | Missing | Existing file hash/size mismatches |
| --- | ---: | ---: | ---: | ---: |
| game | 2367 | 295 | 82 | 0 |
| en-us | 0 | 0 | 177 | 0 |

`audio_lang_14` declares English. All 177 full-manifest **target paths** (including the package marker) are absent under `StreamingAssets`, but subsequent inspection found 174 installed English audio files under `GenshinImpact_Data/Persistent/AudioAssets/English(US)`. The original target-path audit above did not consider this in-game content location. It must not be interpreted as absence of English voice bytes. The alias audit below establishes which of those existing bytes can be safely reused. Preserve English selection and do not add the other three optional voice packs.

The 11 source manifest paths absent from the target exactly match the patch deletion list for `7.0.0`. They are already absent from this partially updated installation. No target file's valid bytes should be removed simply because config.ini still says `7.0.0`.

For a pristine game+English `7.0.0` set, comparison yields 1,733 unchanged files, 1,104 changed files, 84 new files, and 11 obsolete files. Reusing identical MD5+size chunks within each changed source file provides 27,931,273,295 bytes; remaining compressed chunks total 20,234,930,884 bytes before further deduplication.

The initial estimate considering only exact full-manifest source paths was **27,314,503,667 bytes** (game 9,010,644,164; English target paths 18,303,859,503). This is an upper bound that omitted installed `Persistent` voice aliases; the corrected estimate below includes verified reuse from those aliases. Files still needing assembly at the official target paths total 33,871,060,237 bytes. The complete target game+English set totals 150,287,592,051 bytes. These measurements indicate ample room for an APFS clone update given the observed 185 GiB free, provided the clone uses copy-on-write and the updater stages files with bounded lifetime.

## Scope and certainty

Direct service observations establish that ordinary source `getBuild(tag=7.0.0)` and target `getBuild` can construct this update; the current service still also offers a valid patch transition with mixed Copy-Over and HDiff sections. The service does **not** require patch-only updating for this transition. Baseline unconditional HDiff dispatch is incorrect for some returned sections. The extent to which earlier upstream announcements concerned additional changes is not established merely by these observations.

Maintained third-party implementation behavior and licenses are documented separately by the source-research task. Calling a section Copy-Over here is supported by its full target length and, for the sampled DLL, exact target MD5; it is not based solely on third-party terminology. Field 6 semantics and optional-editor launch requirements remain unverified. Successful API calls and manifests are metadata evidence, not proof of a completed update. Clone update and full post-update verification results must be recorded separately before declaring file-level success.

Additional exact investigation commands were:

```sh
/tmp/yaagl-sophon-investigation/venv/bin/python -u /tmp/yaagl-sophon-investigation/probe_patch.py
/tmp/yaagl-sophon-investigation/venv/bin/python -u /tmp/yaagl-sophon-investigation/probe_extras.py
/tmp/yaagl-sophon-investigation/venv/bin/python -u /tmp/yaagl-sophon-investigation/audit_local.py
```

Each exited successfully. Sanitized evidence artifacts in the same temporary directory are `branches.json`, `target.json`, `source.json`, `patch.json`, `wpf.json`, `manifest-summary.json`, `patch-header-summary.json`, `chunk-hash-summary.json`, `wpf-zip-directory.json`, and `local-asset-audit.json`. Source build ID is `3XnPviMfoILi`. Full source/target and patch protobufs are saved as `{source,target,patch}-{matching_field}.pb`; their accompanying downloaded Zstandard metadata is saved with `.zstd` suffix. No API password, token, cookie, authorization header or signed query is included in this document or saved response artifacts.

## Independent APFS validation clone prepared

`python3 /tmp/yaagl-sophon-investigation/clone_installation.py` created a new clone at:

```text
/Users/david/Library/Application Support/YAAGL Update Validation/20260922/game
```

The script refused an existing destination, checked disjoint canonical source/destination roots, verified the backing filesystem is APFS and both roots use device 16777230, rejected symlinks and hardlinks, then called macOS `clonefile(src, dst, 0)` for each regular file. Only old `.tmp` and `ldiff` cache trees were excluded. It cloned 3,757 files with 145,862,425,763 logical bytes in 0.50 seconds.

Every cloned file has a different inode from its original, the same size, and link count one. A complete original file-stat inventory before and after cloning exactly equals the investigation's initial inventory. The per-file source/clone inode receipt is `/tmp/yaagl-sophon-investigation/clone-receipt.json`. This confirms independent files sharing APFS copy-on-write extents, rather than hardlinks to the live installation.

The clone is prepared for destructive validation only after implementation tests pass. Creating a clone is not itself an update-success result.

The checked-in metadata-only reproduction command is:

```sh
/tmp/yaagl-sophon-investigation/venv/bin/python -u scripts/probe-sophon.py --game-dir /Users/david/.gimpact --source-tag 7.0.0 --output /tmp/yaagl-sophon-investigation/reproducible-probe
```

It completed with all five API calls at HTTP 200 / retcode 0 and all 15 manifests at HTTP 200 with validated sizes and decompressed MD5. It imports no updater module and requires a fresh output directory outside the game. The rerun used the repaired schema, which recognizes compressed-MD5 field 7, so its unknown-field counters are empty; the earlier counters above were measured with the baseline schema.

## What the user's previous interrupted update actually proves

Read-only inspection of `~/Library/Application Support/Yaagl OS R2/neutralinojs.log` found 120,807 lines (37,549,142 bytes). On September 22, line 120802 at 21:14:11.172 records target `7.1.0` with supported patch tags `7.0.0` and `6.7.0`; line 120803 records local `7.0.0`; the final line at 21:14:15.978 starts the non-predownload update. **No backend exception, hpatch failure, or subsequent completion is retained in that log.** The baseline `spawn()` helper logs process startup but does not persist a Sophon stdout/stderr stream. No matching Sophon/hpatch/launcher crash report was found in the scoped DiagnosticReports filename search.

A more precise filesystem artifact is the pre-existing `.tmp/Streamed22.pck`: its size 169,292,734 and MD5 `ed2a2054e2873632de3c7034846816a1` exactly match the target manifest; its modification time is 21:15:54.314 on September 22. The installed `GenshinImpact_Data/StreamingAssets/AudioAssets/Streamed22.pck` still matches source version 7.0.0 (165,865,004 bytes, MD5 `6b65d66ad49e37050d291a448834bba9`). This asset's 7.0.0 patch subsection is genuine HDiff, not Copy-Over.

Thus the retained evidence establishes a valid replacement was constructed but had not been published when the earlier operation stopped. It does **not** establish whether the stop was cancellation, process termination, an exception, or another failure. The raw Copy-Over incompatibility remains an independently demonstrated updater defect; it must not be falsely presented as the proven exception that stopped this particular prior run. The mixed-version installation and absent new files are directly demonstrated, and the replacement updater must recover them regardless of the missing historical exception details.

## Correction: installed voice files in Persistent are reusable

A later review found the user's in-game English package under `GenshinImpact_Data/Persistent/AudioAssets/English(US)`, rather than the full launcher's `StreamingAssets/AudioAssets/English(US)` paths. The initial exact-path audit correctly reported missing official target paths, but its download estimate failed to account for this installed content. It would be incorrect to infer that the user had no English voice bytes.

The independent command:

```sh
/tmp/yaagl-sophon-investigation/venv/bin/python -u /tmp/yaagl-sophon-investigation/audit_voice_aliases.py
```

stream-hashed every available English alias with two workers, finishing in 11.16 seconds:

| Comparison against 177 target English entries | Count |
| --- | ---: |
| Persistent file already has exact target size and MD5 | 141 |
| Persistent file has exact old-source size and MD5 | 33 |
| Newly introduced audio file missing from Persistent | 2 |
| Full-package marker has no Persistent audio alias | 1 |

All 174 present files validate against official source or target metadata; they total **17,676,578,598 bytes**. Mapping target chunks by decompressed MD5+size to old-source chunk offsets, plus using the 141 exact-target aliases, identifies **13,853,553,122 reusable target bytes**. Required compressed English chunks are therefore at most **4,451,549,611 bytes**, rather than the initial exact-path estimate of 18,303,859,503 bytes. Together with the earlier game estimate, the corrected download upper bound is **13,462,193,775 bytes** (about 12.54 GiB), before any further cache reuse or duplicate download elimination.

These files are useful byte sources only: the updater must read them without modifying the Persistent cache, verify each copied target chunk, assemble official target files under their manifest paths, and perform final full-file verification. A path alias alone never establishes identity. The new implementation's source-candidate mapping follows this rule and also supports corresponding non-audio Persistent content where present. Source/target manifests and the user's original directory were not modified by this audit. Full sanitized per-file evidence is `/tmp/yaagl-sophon-investigation/voice-alias-audit.json`.

The independent verifier is now checked in as `scripts/verify-sophon-clone.py`. It derives versions and checksums from saved build responses, verifies the saved protobuf checksums before use, imports no updater code, streams file hashes with two workers, checks config/globalgamemanagers/obsolete assets, and compares original inventory and optional initial hash anchors. Result output is rejected inside either game directory. Its eight synthetic CLI tests passed with:

```sh
/tmp/yaagl-sophon-investigation/venv/bin/python scripts/test-sophon-clone-verifier.py
```

They cover a valid independent clone without writes to either installation, same-size corruption, stale obsolete files, original-installation changes, unsafe manifest paths, unsafe output placement, an unavailable source manifest, and an original inode linked under a different clone path. The post-update command is:

```sh
/tmp/yaagl-sophon-investigation/venv/bin/python scripts/verify-sophon-clone.py \
  --clone '/Users/david/Library/Application Support/YAAGL Update Validation/20260922/game' \
  --original /Users/david/.gimpact \
  --manifest-dir /tmp/yaagl-sophon-investigation \
  --original-inventory /tmp/yaagl-sophon-investigation/original-inventory.json \
  --original-hashes /tmp/yaagl-sophon-investigation/original-anchor-hashes.json \
  --categories game,en-us \
  --result /tmp/yaagl-sophon-investigation/independent-clone-verification.json
```

The completed independent live verification result is recorded below; the synthetic tests are separate evidence.

## Retained Persistent voice cache: verified facts and limits

The 174 English files in `Persistent/AudioAssets/English(US)` are **tracked game-managed content**, not arbitrary unowned files. The original `Persistent/res_versions_persist` contains 174 English entries, and every entry's cached MD5 agrees with the corresponding file. `Persistent/ScriptVersion` is `7.0.0`; `audio_revision` and `PatchDone` are `47194594`. Of those tracked files, 141 match the current full target manifest's corresponding canonical voice assets, while **33 match only the old source version and differ from the target**.

The current full Sophon manifests describe `StreamingAssets` voice paths and the root package marker. Verifying those paths establishes the selected full launcher packages' file-level correctness. It does not establish that all game-managed Persistent content has been refreshed, that stale entries are harmless, or which copy the current game will prioritize.

The reviewed maintained Collapse commit `dc47259171794596331dffcf90db85a6ac0415ac` distinguishes full-package installation from in-game resource repair:

- The full-version update dispatches to `StartPackageUpdateSophon`, writes the selected Sophon asset paths, and removes temporary Sophon verification markers. The reviewed install-management code does not invalidate `ScriptVersion` or the Persistent resource manifests as part of this flow. See [full Sophon update implementation](https://github.com/CollapseLauncher/Collapse/blob/dc47259171794596331dffcf90db85a6ac0415ac/CollapseLauncher/Classes/InstallManagement/Base/InstallManagerBase.Sophon.cs#L630) and [version-update dispatch](https://github.com/CollapseLauncher/Collapse/blob/dc47259171794596331dffcf90db85a6ac0415ac/CollapseLauncher/Classes/InstallManagement/Base/InstallManagerBase.cs#L533).
- Genshin's installation inventory builder calls `BuildPrimaryManifest`; the additional `BuildPersistentManifest` invocation is explicitly commented out. See [installation inventory construction](https://github.com/CollapseLauncher/Collapse/blob/dc47259171794596331dffcf90db85a6ac0415ac/CollapseLauncher/Classes/InstallManagement/Genshin/GenshinInstall.PkgVersion.cs#L49).
- Separate repair obtains dispatcher resource manifests and decides whether assets belong in Persistent based on patch status and differences from base-package hashes. It migrates non-patch audio/video to StreamingAssets while excluding assets identified as current patches. See [Persistent placement rules](https://github.com/CollapseLauncher/Collapse/blob/dc47259171794596331dffcf90db85a6ac0415ac/CollapseLauncher/Classes/RepairManagement/Genshin/Fetch.Persistent.cs#L159) and [repair migration](https://github.com/CollapseLauncher/Collapse/blob/dc47259171794596331dffcf90db85a6ac0415ac/CollapseLauncher/Classes/RepairManagement/Genshin/Check.cs#L91).

These sources do not justify inventing a blanket cache-deletion rule or changing Persistent version markers without performing their associated resource update. The implementation retains those cache files and markers unchanged, using valid bytes only as read-only assembly sources. **Current in-game hotfix ownership and runtime precedence remain unverified; this work does not claim that the retained Persistent cache is internally current.** Absence of obsolete canonical source-manifest assets and correctness of every selected canonical target asset must be reported separately from that remaining cache/runtime uncertainty.

## Completed independent clone verification

After the updater's final invocation exited successfully, the exact independent verification command above ran to completion: **exit 0 in 101.598 seconds**. It used the previously saved and checksum-validated official source and target manifests, without importing updater code or modifying either game directory.

| Independent check | Result |
| --- | --- |
| Selected target packages | `game`, `en-us` |
| Target / source version | `7.1.0` / `7.0.0` |
| Target files verified by streamed MD5 and size | **2,921 / 2,921** |
| Target bytes verified | **150,287,592,051** |
| Failed target assets | **0** |
| config.ini version | `7.1.0` |
| globalgamemanagers detected version | `7.1.0` |
| Obsolete source-manifest files or directories still present | **0** |
| Source manifest available for obsolete-file audit | Yes |
| Original 3,846-file stat inventory versus initial snapshot | Unchanged |
| Original config, executable, globalgamemanagers and language-marker SHA-256 anchors | All four unchanged |
| File inodes shared between clone and original, including different relative paths | None |

The external receipt is `/tmp/yaagl-sophon-investigation/independent-clone-verification.json`, including per-file hashes. Original provenance consists of a complete file-stat inventory and four content-hash anchors; it is not a full cryptographic comparison of every original byte. The validated clone is `/Users/david/Library/Application Support/YAAGL Update Validation/20260922/game`.

This demonstrates that the clone's complete selected canonical game and English packages match the official 7.1.0 target manifests. The retained Persistent-cache scope limitations above remain unchanged; no claim of successful game launch or current in-game hotfix-cache verification is made by this file-level result.
