# Genshin 7.1.0 Persistent cache and runtime validation

Started from clean `51c825c`, following `23119a6` and `7839703`. The already verified game clone is `/Users/david/Library/Application Support/YAAGL Update Validation/20260922/game`. The original `/Users/david/.gimpact` is protected and was not selected for launch. No updater, game-launch, FPS, R2, Steam, or security-workaround implementation was changed.

Fresh private evidence: `/tmp/yaagl-710-runtime.MhD1jpR3`. Independent development profile: `/Users/david/Library/Application Support/YAAGL Runtime Validation/20260922/profile`. Times below are UTC; the work began on September 22 in America/Toronto.

## Persistent ownership: before launch

Direct reads found 2,494 JSON records in `res_versions_persist`, including 174 English voice records. All English records omit `isPatch`; 37 other resource records explicitly set that flag. All 33 English files whose bytes match only the old full package are referenced there. No other top-level small Persistent metadata file directly names those 33 archives. The data and silence manifests have 533 and 4 records respectively, with no English voice records. Binary `DownloadPref` and `ctable.dat` were not reverse-engineered, so the text-file search is not proof that no binary references exist.

The cache is associated with resource revisions, not merely arbitrary leftover filenames:

| Marker | Before first launch | At rendered title/agreement |
| --- | --- | --- |
| `ScriptVersion` | `7.0.0` | `7.1.0` |
| `audio_revision` | `47194594` | `47194594` |
| `PatchDone` | `47194594` | `47194594` |
| `data_revision` | `48215702` | Removed |
| `res_revision` | `47805902` | Removed |
| `res_revision_eternal` | `47805902` | Retained |
| `silence_revision` | `47829085` | Removed |
| `base_res_version_hash` | `98e0b0b568962e6714adb99bb40b216d` | `201b945f3e9dd1cfcb3d9b7a3a1dac5e` |

The two base hashes exactly equal the saved official source and target MD5s of `GenshinImpact_Data/StreamingAssets/res_versions_streaming`. The current canonical file also hashes to the latter. Before launch, stale cache metadata does **not** establish which file the client will choose. No cache file was edited or removed during this inspection.

Public-source comparison was rechecked against Collapse HEAD `dc47259171794596331dffcf90db85a6ac0415ac` using `git ls-remote`. Its normal installation builds the primary inventory with Persistent-manifest construction commented out. Separate repair fetches dispatcher manifests, uses patch flags/base-hash differences to determine placement, and writes revision markers from dispatcher responses. This supports separating full-package installation from hotfix repair; it is not source code for the game's own precedence algorithm. See [installation inventory](https://github.com/CollapseLauncher/Collapse/blob/dc47259171794596331dffcf90db85a6ac0415ac/CollapseLauncher/Classes/InstallManagement/Genshin/GenshinInstall.PkgVersion.cs#L49), [dispatcher placement](https://github.com/CollapseLauncher/Collapse/blob/dc47259171794596331dffcf90db85a6ac0415ac/CollapseLauncher/Classes/RepairManagement/Genshin/Fetch.Persistent.cs#L159), and [revision writing](https://github.com/CollapseLauncher/Collapse/blob/dc47259171794596331dffcf90db85a6ac0415ac/CollapseLauncher/Classes/RepairManagement/Genshin/Fetch.cs#L255).

## Reproducible launch preparation

The existing supported configuration was copied into an independent profile: Wine `11.0-dxmt-signed-with-patches`, DXMT `0.80.0`, Steam Patch on, Launch Fix off, FPS unlocking enabled at 150, timeout fix on, Metal HUD on, HDR off, patch-off false, workaround3 false. No runtime-setting experiment was introduced. There were no existing Wine or YAAGL processes when preparation completed.

The profile preparation APFS-cloned 13,436 regular files from the existing profile; it preserved Wine's normal symlinks without traversing them. Six absolute profile-path references in the **copied** Wine registries were rebased to the private profile (four system, two user); neither registry contained an original-game path reference. The private `game_install_dir` was set to the verified clone. No pending patch transaction was present. Existing account state stays in the private profile/game copy; credential contents are not included in the report or copied as log evidence.

The current Global frontend was built with pinned Node 16.20.2/pnpm 7.33.7. The already validated standalone Sophon was placed only in the development profile. The unchanged installed native executable was used directly with `--load-dir-res --path=<private profile>`, bypassing the installed app's profile-copying wrapper. Its matching Neutralino client was extracted read-only and checked against the build recipe's pinned SHA-256. This tests the current production frontend and normal Launch Game button without replacing the installed app.

| Prelaunch file | Bytes | SHA-256 |
| --- | ---: | --- |
| `GenshinImpact.exe` | 444260776 | `08a3086d5f3fe695f01dab61efa42e442006b18e5e475b2520df356f6a073b7d` |
| `globalgamemanagers` | 1974028 | `c1b2d1355ab65f36f51ab9b538957baadd8009fa4f94be78a49f77015424b890` |
| `HoYoKProtect.sys` | 4513984 | `3c5129295ad93e9ad4fabc54940955915e79375c43a778e097dec2de486684dd` |
| `mhypbase.dll` | 27423608 | `c7b4795a41fd8c0d9377eb3334d4ef291752850624fb0b5062c95ff920f0a28c` |
| `rtlbase.dll` | 5538272 | `c31df9788833efc9d39c4bfc9f7cf30d4ff6e63f7ea1e718c2bfe573f8c0355b` |
| Native YAAGL executable | 2036528 | `c67e7eabd572ca7c96dd1ab547a67faa0bac8e08e4fb50e95dd1850af6571939` |

The cloned config and Unity version both remain 7.1.0 at admission. `prelaunch.json` records additional config/runtime identities; `development-artifacts.json` records every built frontend file and Sophon's `87fc9b1bed76ec5d86d6469671bc0e72689b51ba3ed0b430de36f5e195e39e35` hash. Complete prelaunch stat inventories exist for the clone, original game, and installed profile.

The development-only guard rejects an original/alias/misdirected game setting, overlapping profiles, shared game inodes, and evidence outputs inside protected directories. macOS Seatbelt additionally denies all original-game reads/writes and all writes to the installed profile/app for the launcher and descendants. The rule uses canonical paths, including `/private/tmp` resolution. A disposable-file test proved that a child cannot write through a symlink into a protected root; no write was attempted against the actual original as a guard test.

```sh
python3 scripts/test-hk4e-clone-launch-guard.py -v
YAAGL_CHANNEL_CLIENT=hk4eos npm exec --yes --package=node@16.20.2 --package=pnpm@7.33.7 --call \
  'pnpm exec vite build --outDir /tmp/yaagl-710-runtime.MhD1jpR3/frontend'
python3 scripts/guard-hk4e-clone-launch.py \
  --original /Users/david/.gimpact \
  --clone '/Users/david/Library/Application Support/YAAGL Update Validation/20260922/game' \
  --profile '/Users/david/Library/Application Support/YAAGL Runtime Validation/20260922/profile' \
  --evidence /tmp/yaagl-710-runtime.MhD1jpR3/launch-1 \
  --executable '/Applications/Yaagl OS.app/Contents/MacOS/Yaagl' \
  --protect '/Users/david/Library/Application Support/Yaagl OS R2' \
  --protect '/Applications/Yaagl OS.app'
```

Seven guard tests passed. Frontend build passed. No expensive full 150 GB verification was repeated. The normal Launch Game button was pressed through macOS accessibility; the exact timestamp is retained in `launch-button-time.json`.

## First-launch evidence and milestones

Launcher native PID 34897; game macOS PID 35168; retained Windows game PID 280. The bridge's actual game path points to the verified clone. The first run's log basename is `game_1790134910741.log`, with `.wine.log`, `.bridge.log`, and `.steam.log` streams in the private profile. No ordinary unsuffixed game log was created at initial observation.

| UTC | Direct observation |
| --- | --- |
| 03:40:25 | Full launcher initialized; online metadata and selected installation both 7.1.0 |
| 03:42:02.720 | Existing Steam route created/adopted the clone's game process |
| 03:42:13 | DXGI/D3D11 initialization logs appeared; existing FPS worker identified its candidate |
| By 03:42:40 | Rendered animated 7.1.0 title scene and DXMT/Metal HUD; updated terms/privacy agreement visible |
| 03:43:39 | Original inventory unchanged; automatic cache transition recorded |

The screenshot `game-first-window.png` shows `OSRELWin7.1.0_R48145775_S48131320_D48145775`, the title scene, and DXMT D3D11/Metal rendering. This is stronger than process creation or DLL loading alone. It does not establish successful account login, resource download completion, world entry, or sustained gameplay.

The first launch automatically removed 515 Persistent asset bundles, all 174 Persistent English archives, and 9 Persistent videos. All 33 old English mismatches are among those removals. Revision invalidation and the exact new canonical base hash are recorded above. There was no agent cache mutation. This establishes that retaining the old cache did not prevent this startup and that the game performed its own base-version cache transition. It does not prove the precise internal trigger or a universal precedence rule for every hotfix resource.

The three canonical files temporarily renamed by the pre-existing launch transaction (`upload_crash.exe`, `Plugins/crashreport.exe`, and `Plugins/vulkan-1.dll`) are tracked separately from game-driven cache changes and must be checked after normal cleanup. They are not evidence of an updater defect.

At the agreement screen, the agent requested explicit authorization to accept the updated Terms of Service and Privacy Policy. Acceptance is not inferred from launch-test authorization. Further authenticated runtime qualification requires that decision; completed shutdown and integrity observations follow below.

No derivative game-cache experiment is justified by the observed startup. No updater change is indicated.

## Shutdown and post-launch integrity

The agreements were **not accepted**. Choosing Cancel and then Exit in the agreement flow returned to the HoYoverse account-selection/login panel (masked saved account), rather than exiting the process. That establishes login-panel reachability, not successful authentication. Closing that panel and using the title screen's power button and **OK** exited the game normally. Early synthetic clicks and Command-Q did not close it; no forced process termination or alternative launch mechanism was used.

The animated scene remained responsive from at least 03:42:40 through 03:55, over twelve minutes. The existing bridge recorded game exit at **2026-09-23 03:55:37.337 UTC**, code **0x00000000**. Its worker ended before game-exit acknowledgement. YAAGL recorded registry/file restoration and private-resource cleanup complete at **03:55:47.409 UTC**. The request directory and temporary R2 runtime were gone. The development launcher then quit normally, exit **0**, at **03:55:56.239 UTC**. No Wine/Genshin/YAAGL crash report was found in the compared DiagnosticReports locations. Unrelated Apple Trial diagnostics appeared; older files newly seen under `Retired` predate the launch and are not launch crashes.

`postlaunch-integrity.json`, `clone-before.json`, `clone-after.json`, and `clone-changes.json` preserve the complete before/after path inventory. Final differences comprise **702 deleted regular files, 21 changed regular files, one added regular file, and 21 changed directories**. The deleted files are the 698 cached bundles/audio/video files, three revision markers, and `DownloadError.log` (renamed to `.bak`). The changed files comprise the three restored launch-transaction assets, five Persistent settings/version files, twelve SDK account/telemetry database files, and `driverError.log`. Account/cache contents were not exported. Directory metadata reflects those mutations. No save/world progression was exercised.

All **2,921** selected canonical assets remain present. Only the three launch-transaction files had changed canonical metadata; independent size/MD5 checks against the saved official target manifests passed:

| Canonical asset | Bytes | Verified target MD5 |
| --- | ---: | --- |
| `GenshinImpact_Data/Plugins/crashreport.exe` | 2045864 | `3980fa4889bf5f633fe7cc42af9a9185` |
| `GenshinImpact_Data/Plugins/vulkan-1.dll` | 824744 | `318ec59ddf7d9871f68d4cf0fc5c2033` |
| `GenshinImpact_Data/upload_crash.exe` | 9457480 | `2bdae79676ade0adde15961e2cc10f3a` |

The verifier loaded and checksum-validated the saved `target-game.pb` and `target-en-us.pb` using generated protobuf definitions, without importing updater code. `postcheck.py` in the evidence directory records the procedure. Config and globalgamemanagers remain **7.1.0**, with their exact prelaunch SHA-256 values unchanged. No full-package rehash was necessary. Both the original-game and installed-profile stat inventories match their prelaunch inventories exactly. The installed app was protected from writes and was not deployed or redirected.

Persistent markers after shutdown match the title-time table. The resource manifests themselves remained unchanged even though their old cached files were removed: a retained manifest entry does not alone prove an active override. The 33 suspect files cannot override StreamingAssets in the final state because the game removed them. The evidence demonstrates normal base-version invalidation at startup, not the client's complete hotfix precedence algorithm or completion of a fresh dispatcher download. `audio_revision` and `PatchDone` retaining older values is not, by itself, a defect.

Sanitized evidence includes Neutralino logging, launcher stdout/stderr, Wine output, bridge/Steam output, DXGI/D3D11 logs, game `driverError.log`, and the rotated Persistent download log. The Steam stream is empty. The temporary `GenshinImpact.exe:GMS000000011.log` appeared during startup and disappeared on normal shutdown; its content was not preserved. Existing LocalLog output was not current-run evidence. Screenshots preserve renderer/title, agreement, account-selection, and normal-exit confirmation milestones. Request control identifiers and labelled secrets/query strings are redacted from exported text; private account files and registries are not included. Evidence lives outside both games, under `/tmp/yaagl-710-runtime.MhD1jpR3`; preserve that directory before any temporary-file cleanup.

## Classification and qualification limit

| Area | Result |
| --- | --- |
| A: file/update correctness | Previously independently verified full package; targeted post-launch verification passes. No demonstrated updater defect. |
| B: Persistent resource failure | None observed. Game automatically invalidated the old base cache, including all 33 suspect English archives. No manual invalidation, invented revision, or derivative game experiment. |
| C: Wine/runtime/game compatibility | Process, engine/title rendering, DXMT/Metal, login panel, twelve-minute title observation, and normal exit established. Authentication, dispatcher completion, world entry, voice playback, and sustained gameplay remain unqualified. |
| D: YAAGL launch integration | Existing supported transaction launched the clone and restored its files/resources successfully. No integration failure observed. |

Wine did emit diagnostics for `winemenubuilder` (2), a service access check, missing Wine-side `WDFLDR.SYS`/HoYoProtect driver initialization (`c0000142`), unavailable Kerberos support, and a raw-socket permission failure. These are preserved in the Wine stream. They did not prevent the observed title/login panel or normal exit; they do not establish a missing official Sophon asset, nor prove later authenticated gameplay compatibility. No workaround was added in response.

No failure in A–D was demonstrated in this run. The remaining gate is the game's updated legal agreements, not a file-integrity error. Explicit authorization was requested because selecting the required agreements would accept new terms on the user's behalf. No answer was received during the test, so no acceptance was performed. **Do not call 7.1.0 fully runtime-qualified.** Resume with this isolated clone/profile after authorization, record resource-refresh/login/world milestones, observe sustained gameplay, exit normally, and repeat changed-canonical checks.

The validated updater needs **no changes** on this evidence. This commit adds only the development isolation guard/tests and documentation; it does not change the updater, runtime, game files, or security mechanisms.

## Conditional real-install deployment plan — not executed

Deployment remains gated on completing the qualification above and a separate explicit deployment request. This is a concrete future procedure, not a claim that an installable candidate has already been built or qualified in this task.

1. From the clean committed source containing `23119a6`, `7839703`, `51c825c` and this report, build the complete Global app with `YAAGL_CHANNEL_CLIENT=hk4eos YAAGL_BUILD_OUTPUT='/Users/david/Library/Application Support/YAAGL Runtime Validation/20260922/deployment-build' ./build-macos.sh`. The exact artifact to deploy is `/Users/david/Library/Application Support/YAAGL Runtime Validation/20260922/deployment-build/Yaagl OS.app`. Preserve its build manifest and hashes, verify the bundled frontend and compiled Sophon, and smoke-test that bundle against the isolated profile/clone with the guard before deployment. A sidecar-only replacement omits the validated frontend changes.
2. After all owned game/Wine activity and launch cleanup finish, back up the entire current `/Applications/Yaagl OS.app` to `/Users/david/Library/Application Support/YAAGL Runtime Validation/20260922/deployment-backup/Yaagl OS.app`, and the current `/Users/david/Library/Application Support/Yaagl OS R2` to the sibling `Yaagl OS R2` backup. Use fresh backup paths, preserve permissions/symlinks, and record hashes and build identity. Snapshot/back up the original game separately before authorizing its update.
3. Only after explicit deployment authorization, replace `/Applications/Yaagl OS.app` with the tested complete bundle. The installed profile's `.storage/game_install_dir.neustorage` must point to `/Users/david/.gimpact` (its existing setting); confirm in the UI before any real update. The validation-only profile remains separate. Do not install the clone's private profile over the user's profile.
4. The original game still needs the validated full-manifest update before qualifying its 7.1.0 launch: its previously observed config was 7.0.0 despite a 7.1.0 Unity marker. Do not merely edit the version or assume the clone test updated the original. Run the newly validated updater's reliable repair/update with the selected English package after authorization, then independently verify the original's selected official 7.1.0 manifests, missing/obsolete assets, and both version anchors. This is a new installation mutation, so a full verification of that newly updated original is appropriate.
5. Launch the updated original using the same supported configuration, observe its own normal cache transition, and verify every canonical file with changed metadata after shutdown. Confirm launcher cleanup, config/globalgamemanagers 7.1.0, and login/world milestones. Do not delete Persistent preemptively.
6. Roll back only after normal shutdown and completed transactions: restore the backed-up whole app and installed profile to their original paths; confirm the original game setting. App/profile rollback does **not** downgrade a game already updated to 7.1.0. If a game rollback is necessary, use its separately preserved pre-update snapshot; never reconstruct an old package by mixing files or rewriting version markers. Keep the validated clone and evidence until the real installation is qualified.

## Follow-up: authenticated runtime evidence, September 23

The user subsequently reported successful authenticated gameplay in the same isolated clone/profile. Its retained bridge stream (`game_1790167095499.log.bridge.log`) records approximately 79 minutes of successful FPS operation, 23,733 successful reads and 36 successful writes, followed by game exit 0. These counters establish sustained process/FPS operation; the gameplay characterization is the user's report, not a retrospective screenshot claim. Its shutdown exposed the separate FPS-worker classification defect documented in [the shutdown investigation](fps-normal-exit-race-20260923.md).

During that focused fix's isolated reproduction, the saved account reached the world on September 23, with DXMT/Metal rendering, an in-world HUD, and a short character-movement check. No agreement acceptance or credentials entry was performed by the agent. The existing saved session was already usable. The prior agreement/login gate therefore no longer describes the current private profile. Screenshots and per-request bridge/cleanup evidence are retained under `/tmp/yaagl-fps-shutdown-20260923`.

This adds direct authenticated world-entry evidence and user-reported sustained gameplay. It does not claim broad combat/content coverage, English voice-playback verification, a new complete package hash audit, or deployment qualification of the untouched original installation. The updater and deployment policy are unchanged; the FPS report separately records repeated shutdown validation.
