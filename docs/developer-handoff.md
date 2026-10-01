# Developer handoff

Reviewed 2026-09-30. This fork makes HK4E FPS unlocking, launch supervision,
recovery and macOS integration usable together. Its recent polish keeps normal
progress out of red error panels and restores native clipboard shortcuts.

## Source and installed build

- Branch: `main`. Implementation revision: `29ce22bd884a95503fda37052284cc6e3c17ee55`.
  The documentation commit containing this handoff follows it; use `git rev-parse HEAD`
  for that final revision. No production source changes follow `29ce22b` in this delivery.
- The installed `/Applications/Yaagl OS.app/Contents/Resources/manifests/build.json`
  was read during this review: `sourceCommit` is
  `ccd4a7975649f0387bf6499ee6e05fd14e731912`, channel `hk4eos`.
  That detached snapshot and `29ce22b` both descend directly from `727ff2c`,
  and their **entire Git trees are identical**. All 36 pending implementation/test
  files, including the three untracked code/test files, matched snapshot bytes.
  Final differences from the snapshot are documentation only.
- `/Applications/Yaagl OS.rollback-20260928.app`, the installed app, settings,
  games and external runtimes were left untouched. No build, app launch or
  reinstallation was performed. Manifest/source agreement is not a fresh
  verification of every installed binary; installation byte/mode verification
  is historical evidence in [final polish verification](launcher-final-polish-verification.md).
- All 33 tracked modifications and six untracked files belonged to the completed
  work or its evidence. No unrelated working changes were found or discarded.
  `feat/hk4e-game-mode` pointed to `727ff2c`, with zero unique commits, and was
  deleted with `git branch -d`. No remote branch was changed.

## Verified upstream baseline

`origin` is **our fork**, `git@github.com:zh0ngy1l1/yet-another-anime-game-launcher.git`.
The upstream is [3Shain/yet-another-anime-game-launcher](https://github.com/3Shain/yet-another-anime-game-launcher).
The inherited baseline is **`514ebed106dc8c3b986a655d39d5bded8753941b`**:
the local `main` reflog starts there at clone, `d808fbe` has that sole parent,
and both `git merge-base main FETCH_HEAD` and
`git merge-base 514ebed FETCH_HEAD` returned it after fetching upstream for inspection.

The primary comparison below is **upstream as inherited at that baseline versus
our final committed source**. To reproduce it, run `git diff 514ebed HEAD -- src native scripts sophon_server`.
Source links to upstream are pinned; local links refer to this checkout. Commit
IDs identify useful changes, not substitutes for the source evidence.

## What changed from inherited upstream

| Area | Upstream baseline behavior | Our behavior | Source / useful commits | Verification limits |
|---|---|---|---|---|
| FPS and process supervision | A global default/120/144 setting existed, but baseline `fpsUnlock` references only store/display it; HK4E DXMT launch sets a fixed 60 cap. No owned FPS bridge. | HK4E enable switch and validated integer target 1–360; targets above 60 remove the game-side DXMT cap. A local worker acts only on the attributed game; retained handles/jobs and Wine completion gate restoration. | [Baseline setting][base-fps], [baseline launch][base-launch]; [runtime policy](../src/clients/mhy/hk4e/fps-runtime.ts), [bridge](../src/clients/mhy/hk4e/fps-bridge.ts), [native worker](../native/fps-bridge/worker.c); `a1c299a`, `1c45c58`, `0f5b4bf`, `5d5e029`. | Existing FPS UI was extended, not invented. Requested FPS is not achieved throughput; finite Global evidence only. |
| Private Wine / R2 | Launch uses the selected installed Wine runtime. | Verify exact input identities, prepare an independent private APFS runtime, apply pinned R2 bytes for enabled FPS, verify output, and dispose only after owned completion/restoration. | [Baseline launch][base-launch]; [preparation](../src/clients/mhy/hk4e/prepare-r2.ts), [recipe](../native/wine-r2/README.md); `c1cf04e`. | Requires supported Wine bytes, APFS and disk space; arbitrary distributions are not qualified. |
| Steam launch | Steam Patch already starts `C:\windows\system32\steam.exe` with the game path. | Preserve the signed shim/child creation route while adding verified C: mapping, child attribution, job observation and desktop cleanup to FPS launches. | [Baseline launch][base-launch]; [Steam adapter](../src/clients/mhy/hk4e/fps-steam.ts), [native Steam logic](../native/fps-bridge/steam.c), [source analysis](../native/fps-bridge/steam-source.md); `2d21043`, `1daea26`, `648b4d2`. | Not Steam client/library integration newly added by this fork. Main live route has Steam Patch on. |
| HDR, resolution, native fullscreen and size memory | HDR and custom resolution already write registry values; their revert helpers delete keys and suppress some restore failures. | Retain HDR/resolution options, use captured restoration in owned launches, add native macOS fullscreen and per-server window-size memory with durable startup recovery. | [Baseline launch][base-launch]; [launch orchestration](../src/clients/mhy/hk4e/program-launch-game.ts), [window session](../src/clients/mhy/hk4e/window-session.ts), [driver recipe](../native/wine-fullscreen/README.md); `f033cf6`, `1dece8a`, `b9446c6`, `b24cbd3`. | Fullscreen and remembered-size live checks exist; this is not new HDR support or universal display qualification. |
| Game Mode | No dedicated Game Mode host/routing or setting in the baseline. | Optional pinned app host and resolved child routing compose with fullscreen and ordinary/R2 private runtimes. Preference is inactive without native fullscreen; admission checks host/runtime support. | [Admission](../src/clients/mhy/hk4e/game-mode.ts), [host and recipe](../native/wine-game-mode/README.md); `f1a68d2`, `110c07a`, `676e30a`. | Activation observed in brief corrected runs; no performance A/B, long-session or general performance claim. |
| Sophon game updates and recovery | Sophon install/repair/update/predownload already exist. Update frontend performs an audio migration; WebSocket closure can terminate progress without authoritative completion. | Full-manifest verified chunk reuse, durable staging/restart, obsolete quarantine and version metadata committed last. Frontend tracks authoritative worker completion with REST fallback and recognizes interrupted versions. | [Baseline tasks][base-tasks], [baseline progress][base-sophon]; [engine](../sophon_server/full_update.py), [provider](../sophon_server/sophon_full.py), [client](../src/sophon.ts), [update UI](../src/clients/mhy/hk4e/program-update-game.ts); `23119a6`, `7839703`. | Global 7.1.0 clone verified independently; CN/BB gameplay/update qualification and optional WPF editor updating remain absent. |
| Startup and Launch Fix | JS/service initialization and existing network-blocking launch script; no native guarded hidden-bootstrap protocol. | Native startup deadline and hidden WebKit initialization; owned service spawning, artwork readiness, recovery and normal-close veto. Launch Fix is composed with owned launch cleanup. | [Baseline launch][base-launch], [baseline entry][base-entry]; [bootstrap](../src/bootstrap.ts), [native bootstrap](../native/bootstrap/bootstrap.cpp), [Launch Fix](../src/clients/mhy/hk4e/launch-fix.ts); `3334d02`, `85afe76`, `4e396b1`. | Native fixtures and installed startup passed historically; artwork remains a startup dependency. Live route uses Launch Fix off. |
| Status, errors and clipboard | Queued/localized progress and generic fatal presentation; baseline has no new ownership panel. | Fork ownership panel now separates status/error/warning. Optional probe timeout cannot report game launch failure; native Edit responder actions survive icon changes. | [Ownership](../src/launcher/launch-ownership.ts), [transaction](../src/clients/mhy/hk4e/launch-transaction.ts), [error wrapper](../src/utils/errors.ts), [native patch](../scripts/build-hk4e-native.py); `29ce22b`. | These repair regressions/limitations in the fork's earlier ownership UI; do not attribute its false alarm to upstream. Live/user evidence below. |
| Packaging and tests | Existing Neutralino app/channel packaging, build CI and some unit tests. | Self-contained macOS build with pinned public inputs, source/toolchain manifests, signed-input checks, portable xdelta, separate Global/China outputs and expanded lifecycle/updater/native tests. | [Baseline package][base-package]; [build entry](../build-macos.sh), [build orchestrator](../scripts/build-macos.cjs), [package verifier](../scripts/verify-macos-package.cjs), [validation](validation.md); `d808fbe`, `b4807b7`, `feb5545`, `7f18d09`. | Repeatable procedure, not byte-reproducibility across SDK/compiler versions; ARM64 launcher, Intel helpers via Rosetta, ad-hoc native signing, no notarization. |

[base-fps]: https://github.com/3Shain/yet-another-anime-game-launcher/blob/514ebed106dc8c3b986a655d39d5bded8753941b/src/config/fps-unlock.tsx
[base-launch]: https://github.com/3Shain/yet-another-anime-game-launcher/blob/514ebed106dc8c3b986a655d39d5bded8753941b/src/clients/mhy/hk4e/program-launch-game.ts
[base-tasks]: https://github.com/3Shain/yet-another-anime-game-launcher/blob/514ebed106dc8c3b986a655d39d5bded8753941b/sophon_server/tasks.py
[base-sophon]: https://github.com/3Shain/yet-another-anime-game-launcher/blob/514ebed106dc8c3b986a655d39d5bded8753941b/src/sophon.ts
[base-entry]: https://github.com/3Shain/yet-another-anime-game-launcher/blob/514ebed106dc8c3b986a655d39d5bded8753941b/src/index.tsx
[base-package]: https://github.com/3Shain/yet-another-anime-game-launcher/blob/514ebed106dc8c3b986a655d39d5bded8753941b/build-app.js

### Current upstream, inspected separately

Fetched 2026-09-30 using `git fetch --no-tags https://github.com/3Shain/yet-another-anime-game-launcher.git main`.
Remote `main`/HEAD was **`fc56d843461a313fdc5c19af2a2a47eaf8f2f6ac`**, four commits
after the baseline. Source diffs show a DXMT archive/version change to `654f547`,
string comparisons for resource versions, removal of HSR's `-disable-gpu-skinning`
argument, and an explicit unknown-result message in manual launcher update checks.
See the [pinned upstream diff](https://github.com/3Shain/yet-another-anime-game-launcher/compare/514ebed106dc8c3b986a655d39d5bded8753941b...fc56d843461a313fdc5c19af2a2a47eaf8f2f6ac).
These were **not merged or applied**. Launcher self-update remains distinct from
Sophon game updating. [The inherited launcher updater](../src/updater.ts) still
targets `3shain` releases and can replace profile resources/sidecars; development
versions skip its check. Define a fork update policy before enabling release-version
self-updates; no self-update compatibility was validated here.

## Recent behavior to preserve

Confirmed running text is exactly `game is running (DO NOT CLOSE THE LAUNCHER)`.
Successful game cleanup and startup recovery leave **blank idle status**. New
reservations clear stale errors; old completions cannot erase a newer status.

The optional FPS probe deadline includes mailbox latency, not game lifetime.
Its failure warns that FPS unlocking is unavailable while retaining the attributed
game and all cleanup guards. The original slow-probe cause is unproved without
that run's logs. Unknown exit status is a warning; confirmed abnormal exit is an
error. Observation retry says `Check game status again`; restoration retry says
`Retry safe cleanup`. Recovered cleanup history stays diagnostic, not a final red failure.

Operation errors explain the failed action and retain raw causes/output in logs.
Deliberate cancellation says `Closing Yaagl OS.`. Native macOS Edit actions use
AppKit's responder chain, including after `window.setIcon`; preserve this instead
of intercepting keys in JavaScript or changing Wine/game mappings.

## Where to work

| Modules | Responsibility |
|---|---|
| `src/index.tsx`, `src/bootstrap*.ts`, `native/bootstrap/` | Startup ownership, deadlines, presentation and normal close. |
| `src/launcher/{index.tsx,task-queue.ts,launch-ownership.ts,startup-recovery.ts}` | Task UI, launch reservation, separate message surfaces and startup restoration. |
| `src/clients/mhy/hk4e/{program-launch-game,launch-fps-game,launch-transaction}.ts` | Admission, enabled/disabled routes, supervision and ordered restoration. |
| `src/clients/mhy/hk4e/fps-*.ts`, `native/fps-bridge/`, `src/wine/owned-execution.*` | Artifact trust, protocol/worker lifecycle, attributed process execution. |
| HK4E `prepare-r2.*`, `launch-journal.ts`, `window-session.ts`, `game-mode.ts`; `native/wine-*`, `native/window-state/` | Private runtime selection, preimages, fullscreen/window recovery and Game Mode inputs. |
| `src/sophon.ts`, `sophon_server/{server,tasks,sophon_full,full_update}.py` | UI/service transport, serialized work, manifest adaptation and verified updating. |
| `scripts/build-*`, `scripts/verify-*`, `scripts/test-*`, `src/**/*.spec.ts` | Build provenance, artifact verification and regression fixtures. |

## Build and validation

Use [build-macos.md](build-macos.md) for the complete procedure and
[validation.md](validation.md) for native/Python/bundle suites. Source checks:

```sh
npm exec --yes --package=node@16.20.2 --package=pnpm@7.33.7 --call 'pnpm install --frozen-lockfile'
python3 -c "from pathlib import Path; import base64; Path('src/clients/secret.ts').write_bytes(base64.b64decode(Path('src/clients/secret.b64').read_bytes()))"
npm exec --yes --package=node@16.20.2 --package=pnpm@7.33.7 --call 'pnpm run precommit && pnpm test'
git diff --check
```

For a future app build from clean committed source: `./build-macos.sh` (Global),
or `YAAGL_CHANNEL_CLIENT=hk4ecn ./build-macos.sh` (China). Default output is
`build/hk4eos/Yaagl OS.app`; choose `YAAGL_BUILD_OUTPUT` to preserve an existing output.
The build runs its package verifier. No installed app/profile is a build input.

Required: Apple Silicon macOS (qualified on 26.6.2; minimum app API is macOS 14),
Xcode CLT, Git/npm, Python 3.13+, uv, MinGW `x86_64-w64-mingw32-gcc`, Rosetta 2,
network access to pinned archives and sufficient space (roughly 10 GB for builds,
excluding games). Entry point selects Node 16.20.2/pnpm 7.33.7. Recorded native
tools include Apple Clang 21.0.0, MinGW 16.2.0, uv 0.12.10; Sophon uses managed
Intel CPython 3.13.15 and protoc 31.1. Runtime R2 preparation needs APFS and the
pinned Wine 11.0 DXMT signed-with-patches input. Gameplay needs separately acquired
game data/account; native keyboard fixtures need an unlocked desktop, Accessibility
permission for System Events and TextEdit. Private evidence paths are not portable inputs.

### New results from this housekeeping pass

- `pnpm run precommit`: TypeScript, full ESLint and formatting passed; ESLint
  reports **9 existing warnings, zero errors**. Full Vitest: **36 files / 2,145 tests passed**.
  Command used the pinned Node/pnpm above; log: `.tmp/handoff-source-checks.log`.
- Python syntax parsing for `build-hk4e-native.py` and `node --check` for both
  changed native fixture scripts passed. Diff whitespace and documentation links/IDs checked.
- Snapshot/tree equivalence and installed source manifest checked read-only.
  Native UI tests, package verification and app builds were not rerun.

### Historical evidence and user confirmation

[Status/clipboard verification](launcher-status-clipboard-verification.md) records
real macOS keystrokes, TextEdit transfer, production fields/status/error selection,
a Start Game screen and recovery from invalid FPS settings. It predates the final
wording. The user separately confirmed clipboard works in **launcher and game**
and the false launch-failure alarm is fixed; this is user confirmation, not a new
live test performed here.

[Final polish verification](launcher-final-polish-verification.md) records 2,145
tests, a 554-file package check, native cancellation/failure fixtures, installed
startup with blank status and unchanged hashes for 22 settings files. After-game
blank status was tested automatically, not by another live gameplay pass.

[Updater verification](genshin-updater-validation-20260922.md) records an independent
Global 7.1.0 clone audit of 2,921 files; [runtime evidence](genshin-runtime-validation-20260922.md)
records authenticated gameplay and cleanup. [Fullscreen evidence](native-fullscreen-validation-20260923.md)
and [Game Mode evidence](game-mode-validation-20260923.md) record their finite
live checks. Game Mode activation is **not evidence of a performance gain**;
performance A/B was waived, not passed. China, other clients, older macOS,
arbitrary runtimes and long-session behavior remain outside these live results.

## Outstanding work, in user-impact order

1. **Honor prompt responses.** Legacy BH3/HSR/NAP unsupported-version paths await
   YES/NO but ignore the result. Decide cancellation/repair behavior before changing
   wording; see their `index.tsx` files and audit LOC entries.
2. **Finish download-state handling.** `src/aria2.ts` streaming only finishes on
   `complete`; zero-length totals bypass the delay. Error/removed/paused states
   need explicit behavior. Admission wording is fixed; its state machine is not.
3. **Catch async settings/manual update failures.** Some callbacks and legacy
   launch catches still provide no reliable visible result; inspect `src/config/`,
   `src/app.tsx` and audit EXT-007/008. Post-operation persistence failure also
   needs a distinct outcome (EXT-009).
4. **Stop artwork from blocking startup.** Remote image load/decode participates
   in readiness (`bootstrap-artwork.ts`, HK4E `index.tsx`, `utils/helper.ts`).
   Add a deliberate fallback without weakening service/cleanup admission.
5. **Improve diagnostics without guessing lifetime.** `exec2`'s per-event stream
   capture can lose earlier output; service wrappers obscure causes; some
   postlaunch diagnostic failures are logs-only. Logger failure is best-effort.
   Sustained unknown lifetime can block indefinitely by design. The exact original
   probe delay and Wine teardown thread-abort cause remain unresolved.

The [533-row audit](launcher-error-message-audit.md) preserves historical messages,
current routing and deferred items. Do not treat every recommendation as an
implemented fix or every source scenario as live-tested.

## Maintenance and cleanup constraints

Never infer completion from a disappearing window, process-name match or timeout.
Retain request identity, creation context, handles/jobs, late acknowledgements and
journals until existing gates prove cleanup safe. Do not retarget descendants,
kill shared Wine, delete guards to retry, restore files while owners remain live,
or modify an installed/runtime library in use. Keep updater verification independent
of updater implementation; game tests use protected independent clones.

Housekeeping removed only ignored stale `dist/` frontend output (the configured
Vite output) and root/build `.DS_Store` files. Build app outputs were already gone.
`.tmp` logs, screenshots, settings backup, fixture artifacts and four detached build
worktrees remain: they preserve unique evidence/provenance and are not a clean-checkout
requirement. No duplicate current guide was removed; the two recent reports describe
different checkpoints. Before future deletion, inventory those worktrees/evidence
and preserve any unique records. Source, licenses, pinned assets and build recipes remain.

No push, release, publication, merge from upstream or installed-app alteration was
performed. Remaining reproducibility limits are external downloads/toolchains and
private historical evidence, not an unresolved fork baseline or missing source commit.
