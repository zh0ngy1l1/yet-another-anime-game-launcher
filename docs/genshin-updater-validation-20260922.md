# Genshin updater implementation and validation — 2026-09-22

The starting checkout was clean `main` at `f843d493878fc5ddc544311f3b83ac40f630438f`, with only the user's fork as `origin`. No upstream repository, original game file, launcher profile, Wine installation, FPS/R2 component or installed application was modified.

## Evidence and protocol decision

[Protocol findings and references](sophon-protocol-references.md) record the durable service observations, public source commits, relevant YAAGL PRs/issues, and licenses. Implementation is original Python/TypeScript; no unlicensed external implementation was copied.

The current global service returns both ordinary full builds (`getBuild` target 7.1.0 and explicit source `tag=7.0.0`). It also still serves the legacy patch transition, whose sections contain both HDiff and raw Copy-Over bytes. Thus full manifests are sufficient; a claim that the service has entirely removed patch builds would be incorrect. Baseline unconditional HDiff dispatch is incompatible with raw sections. Basename collisions, size-only repair skipping, early deletion and failed-patch publication are separate confirmed code defects. Historical logs do not preserve the exact exception that interrupted this user's previous update; a valid unpublished staged audio file provides direct interruption evidence without establishing the exception.

The observations establish current compatibility defects. They do not establish when Copy-Over first appeared or prove that an entirely new wire protocol caused the historical interruption.

Genshin now uses full manifests for update, predownload and reliable repair. It does not require `getPatchBuild` or restrict eligibility to `diff_tags`. Missing source manifests fall back to the full target; existing matching target chunks can still be reused. Legacy patch support remains isolated for the other client, with explicit HDiff/raw classification and mandatory final size/MD5 verification.

## Safety and package behavior

- Discover the current build with credentials kept in memory. Validate manifest decompressed length/MD5, honor compression/encryption controls, and pin the target content identity.
- Preserve declared or detected installed languages. The real installation declares English and stores 174 verified source voice files under Persistent rather than the full manifest’s StreamingAssets paths; game plus English are selected, not the other three languages. Hash-verified chunks from Persistent are reused as source data without modifying that cache. Full resource categories are enumerated using branch type/scenario metadata. Unknown categories fail closed.
- Use 64-bit asset sizes and the newly observed compressed-MD5 field 7. Validate compressed MD5 and ID-prefix XXH64 when available, decompressed chunk MD5/size, then final asset MD5/size. Field 6 remains uninterpreted.
- Reuse chunks only after checking their actual bytes by decompressed MD5 and size, using source offsets independently of target offsets. A corrupt or partially updated source file is never trusted as a whole.
- Stream game-file I/O. At most two files assemble/verify concurrently, with at most four network chunks prefetched per file; the independent final audit uses two workers. No whole game asset is loaded with `read_bytes()`.
- Use full-path-derived, collision-resistant staging on the destination filesystem. Reject traversal, absolute/Windows paths, reserved updater paths, symlinks and case/Unicode collisions.
- Stage **all** changed files before publishing replacements. Flush and fsync verified staging, then atomically replace each destination. Never delete the original executable before its valid replacement exists.
- Persist a versioned journal of target identity, selected categories, verified files, source version, obsolete ownership and phase. Rehash installed/staged files on restart; the journal alone does not establish validity.
- Reverify the complete mandatory target set after publication. Only then quarantine known obsolete assets and atomically replace `config.ini`'s version. Unowned files, saves and optional content are preserved. Quarantine is retained for recovery under `.sophon-update/obsolete`.
- Predownload verifies and caches missing compressed chunks without publishing game files, deleting obsolete assets or changing version metadata. Disk-space, download, checksum and cancellation errors leave source files and the previous committed version recoverable.
- REST operation schemas are explicit; the service serializes operations that share legacy state. Late WebSocket clients receive bounded progress snapshots. UI completion requires authoritative worker completion, with REST status polling after disconnect.
- The UI uses the older valid version anchor from config.ini and Unity metadata, so an interrupted update remains visible even if `globalgamemanagers` has already changed.

The separate optional WPF editor archive is not installed in the user's game and is not downloaded. Mandatory BeyondUGC assets are ordinary game-manifest entries. This implementation detects an installed WPF editor and fails closed rather than silently committing an inconsistent editor version; updating that optional ZIP package is not implemented. The current global selection is live validated; CN/BB request routing is implemented but has not been validated on an installed CN/BB game. Future unknown category/encoding semantics require explicit support.

The retained Persistent cache has its own game-managed inventory: 33 English cache files differ from the corresponding current full-package assets, and its ScriptVersion remains 7.0.0. The full-package manifests require the canonical StreamingAssets paths. Maintained full-package installation and dispatcher-based in-game repair are separate flows; the reviewed installer does not invalidate that cache. This update verifies the canonical packages and preserves the cache. Current hotfix ownership and runtime precedence have not been verified, so this report does not claim that every Persistent cache entry is current. The later runtime report records the automatic game-managed cache transition.

## Automated validation

Commands use isolated environments or generated, ignored build output. The full JavaScript suite needed the repository's existing ignored `secret.ts` generation from tracked `secret.b64`; no secret contents were logged or committed.

```sh
npm exec --yes --package=node@16.20.2 --package=pnpm@7.33.7 --call 'pnpm install --frozen-lockfile'
npm exec --yes --package=node@16.20.2 --package=pnpm@7.33.7 --call 'pnpm test'
npm exec --yes --package=node@16.20.2 --package=pnpm@7.33.7 --call 'pnpm exec tsc'
/tmp/yaagl-sophon-test-venv/bin/python scripts/test-sophon-full-update.py -v
/tmp/yaagl-sophon-investigation/venv/bin/python scripts/test-sophon-legacy.py -v
/tmp/yaagl-sophon-investigation/venv/bin/python scripts/test-sophon-service.py -v
/tmp/yaagl-sophon-integration-venv/bin/python scripts/test-sophon-server.py
python3 scripts/test-sophon-online-info.py
/tmp/yaagl-sophon-investigation/venv/bin/python scripts/test-sophon-clone-verifier.py
python3 scripts/test-sophon-clone-guard.py
uv lock --check --project sophon_server
git diff --check
```

Results: JavaScript 31 suites / 2,068 tests pass; TypeScript compilation passes. Python regression tests total 108: engine 39, legacy/adapter 18, provider 18, REST/WebSocket server 7, existing startup metadata 7, independent clone verifier 8, and clone guards 11. Targeted formatting/lint passes, apart from the existing generic progress-event `any` warning.

Synthetic coverage includes unchanged, new, reordered and duplicate chunks; correct source offsets; corrupt sources; already-target files; same-basename parallel files; directory entries; obsolete quarantine; compressed and decompressed corruption; truncated downloads; final hash mismatch; disk-space failure; cancellation during construction, prefetch, publication and finalization; corrupted resumed stages; source-build unavailability; predownload cache reuse; unsafe paths; explicit eight-download ceiling; raw Copy-Over; and real ordinary/empty-source HDiff with the bundled `hpatchz` executable.

The standalone build and isolated online smoke also passed:

```sh
python3 scripts/build-sophon.py
python3 scripts/test-sophon-bundle.py sophon_server/build/server.dist/sophon-server
sophon_server/.venv/bin/python scripts/test-sophon-bundle.py sophon_server/build/server.dist/sophon-server --websocket
```

The build uses the pinned Intel CPython 3.13.15/Nuitka 2.7.16 toolchain and explicitly bundles certifi's CA file. The isolated smoke submitted no game operations, confirmed healthy status and live 7.1.0 metadata with full-manifest capability, and stopped its server. The final rebuild includes Persistent source-alias reuse; its SHA-256 is `87fc9b1bed76ec5d86d6469671bc0e72689b51ba3ed0b430de36f5e195e39e35`. Its bundled CA SHA-256 is `9cc2a774b5198dcff14d9be1e66091f538975d867ce029a96bce15a55dfd730f`. The final artifact independently passed the same healthy/live-metadata smoke and a real WebSocket transport check against an unknown task ID.

## Live clone validation

The independent APFS clone and original-file provenance are described in the investigation. The development command enforces disjoint canonical paths and rejects symlink/hardlink sharing before any game write:

```sh
/tmp/yaagl-sophon-investigation/venv/bin/python scripts/sophon-update.py \
  --gamedir '/Users/david/Library/Application Support/YAAGL Update Validation/20260922/game' \
  --clone-of /Users/david/.gimpact \
  --cache /tmp/yaagl-sophon-investigation/provider-cache \
  --result /tmp/yaagl-sophon-investigation/clone-update-result.json
```

A controlled SIGINT interrupted the first run during construction. The journal retained 27 verified staged assets; the original executable remained present at 444,260,776 bytes, and the clone's config.ini remained 7.0.0. No replacement publication had begun. Subsequent resumptions use the same journal and verify staged bytes before reuse. A second controlled interruption introduced verified Persistent voice-cache reuse after the actual in-game layout was discovered; the target identity remained unchanged. This reduced the estimated required download from 27.31 GB to 13.46 GB before accounting for already-staged work. A bounded four-chunk prefetch per file was added after observing network latency in the initial run; whole-file verification remains limited to two workers.

The resumed update exited **0** and reported target **7.1.0**, categories `game,en-us`, and **2,921 verified files**. Publication and the complete post-publication hash pass finished before final version metadata was committed. This final invocation downloaded **11,251,846,592 compressed bytes**, reused **19,638,525,942 verified local bytes**, and took **3,455.59 seconds**. These transfer counters cover the final invocation, not earlier interrupted runs or existing staged/cache data.

Independent post-update verification exited **0** in **101.60 seconds**: **2,921/2,921 files**, totaling **150,287,592,051 bytes**, matched the official target sizes and MD5s with no failures. Both `config.ini` and the version embedded in `globalgamemanagers` report **7.1.0**. None of the 11 source-manifest-only paths remain. The complete original 3,846-file stat inventory and all four initial SHA-256 anchors are unchanged; no original/clone file inode is shared, including across different relative paths.

The independent audit imports no updater implementation. It checks saved official manifest lengths/MD5s, every selected target file, both version anchors, source-manifest obsolete paths, all recorded original file metadata, four original SHA-256 anchors, and global original/clone inode separation:

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

Original provenance evidence comprises the complete recorded file metadata and the four supplied anchor hashes; it is not a full byte-for-byte rehash of every original file.

The final compiled-service check uses the actual REST reliable-repair route and WebSocket event stream, against this independently verified clone only:

```sh
sophon_server/.venv/bin/python scripts/test-sophon-clone-rest.py \
  --executable sophon_server/build/server.dist/sophon-server \
  --expected-binary-sha256 87fc9b1bed76ec5d86d6469671bc0e72689b51ba3ed0b430de36f5e195e39e35 \
  --original /Users/david/.gimpact \
  --clone '/Users/david/Library/Application Support/YAAGL Update Validation/20260922/game' \
  --expected-version 7.1.0 \
  --cache /tmp/yaagl-sophon-investigation/compiled-rest-cache \
  --result /tmp/yaagl-sophon-investigation/compiled-rest-repair-result.json
```

Compiled reliable repair exited **0** in **448.40 seconds**. Both REST and WebSocket confirmed completion at **7.1.0**, covering **2,921 target files** and **5,842 verification events** (initial scan plus final verification). It downloaded **zero game-chunk bytes**, reused zero chunk bytes, and reported no error. The original's complete **3,996-entry** inventory, including directories, was unchanged before/after this operation. The global inode guard found no sharing. The isolated compiled server stopped successfully. This establishes reliable integrity verification through the actual bundled service, in addition to the independent manifest audit.

The original `/Users/david/.gimpact` remains untouched. Only the independent clone was updated. The installed launcher application/profile was not replaced or redirected, and the game was not launched. Wine/security compatibility and in-game hotfix-cache behavior therefore remain separate, unverified concerns.

## Focused commits

- `23119a6` — verified and resumable full-manifest Genshin engine, provider, legacy compatibility fixes, live research and regression tests.
- `7839703` — launcher completion handling, interrupted-version detection, progress integration and UI tests.
- `51c825c` — independent clone verification, compiled REST/WebSocket verification, stronger development clone/auxiliary-path guards, and final evidence/commands.

## Runtime follow-up

The [Persistent cache and runtime report](genshin-runtime-validation-20260922.md) records the clone's automatic cache transition, rendered 7.1.0 title/login panel, normal exit, and successful targeted post-launch verification. Its September 23 addendum records subsequent authenticated gameplay; see that report for the finite qualification. No updater change was indicated; the original installation and installed launcher remain untouched.
