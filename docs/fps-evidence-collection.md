# Preserving an identified FPS run

`python3 scripts/collect-hk4e-launch-evidence.py --profile PROFILE --run-log game_TIMESTAMP.log --output NEW_DIRECTORY --console CONSOLE_DIRECTORY` preserves all streams for the named run, the full launcher log, referenced request files, configuration and available crash evidence. It does not start an application or write protocol commands. The output must be new and outside the profile. Keep the console input outside the output tree.

Large Wine logs can be preserved with optional `--clone-files` on APFS. This creates an independent copy-on-write inode from an already opened regular-file descriptor; later source changes do not change the capture. It hashes the complete snapshot and records its size. There is no ordinary-copy fallback: a failed clone stays an explicit per-file error, preventing an unexpected full second allocation of a multi-gigabyte log. The default remains a bounded byte copy.

Inspect `manifest.json`; a printed output path alone does not establish complete evidence. Required files need `copied: true` and no error. `stable: false` means the source changed during capture, even when the cloned snapshot is complete. Preserve live captures, then obtain a stable final capture after confirmed cleanup. Missing optional streams remain explicit.

The collector cannot recover preimages after cleanup deletes them. Before a controlled game run, capture and verify every launcher-controlled file state and relevant typed registry value independently; retain live journal/snapshot versions; compare the final restored files and persisted registry only after Wine exit. Cleanup acknowledgements and independent restoration equality are separate results.

Filesystem regressions: `python3 scripts/test-collect-hk4e-evidence.py`. The APFS-specific tests require macOS/APFS; they use only temporary files, including an actual independent clone, rejected replacement, clone failure and source growth.
