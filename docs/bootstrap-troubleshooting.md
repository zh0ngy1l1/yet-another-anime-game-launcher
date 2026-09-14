> Historical investigation: the visible "Starting launcher…" implementation and runtime commands below describe the earlier candidate. The current hidden-startup implementation, native clock, guarded failure panel and validation limits are documented in [native/bootstrap/README.md](../native/bootstrap/README.md). The current harness was subsequently replaced with guarded isolated hidden-startup fixtures; the owned3 evidence and discovered WebKit scheduling defect are described in that current document. The historical commands below do not describe the current harness.

## Current owned3 correction (2026-09-14)

The hidden-bootstrap owned2 delivery (`237dfcaf…`) was tested in an isolated
native fixture using the real entry point and Sophon retry, with no application
setup, sidecars, Wine or game. A short retry passed. Permanent unavailability
stalled after three requests at about six seconds even though the retry delay
was native: hidden WebKit also suspended JavaScript receipt of RPC results and
normal-close events. The native failure panel remained responsive. This is a
newly demonstrated limitation of the owned2 implementation, distinct from the
historical visible-window candidate below.

[Owned3 bootstrap](../native/bootstrap/bootstrap.cpp) selects the public
[WebKit inactive-scheduling policy](https://developer.apple.com/documentation/webkit/wkpreferences/inactiveschedulingpolicy-swift.property)
`None` before navigation, preserving JavaScript progress through initialization
and guarded failure/cancellation. It restores the previous policy after accepted
DOM readiness shows the main window. The [native build recipe](../scripts/build-hk4e-native.py)
also removes the upstream constructor's early zero-size window ordering;
configured visible windows still show normally. Hidden startup requires macOS14+;
the older-OS native failure fallback has not been runtime-tested.

The revised [native fixture harness](../scripts/test-bootstrap.cjs) requires a
separate prepare step and hash-verified explicit run. DOM timers and animation
callbacks are frozen. It requires no initial onscreen window, hidden retries,
initialized DOM before showing, visible native failures, ordinary close vetoes,
cleanup acknowledgements and native exit0. Source/fixture checks complement
sampled window metadata; they do not themselves rule out every sub-frame visual
artifact or establish actual packaged-app/gameplay behavior.

Evidence remains under:
`/Users/david/Library/Application Support/YAAGL Local Builds/fps-autonomous-validation-20260914T130005Z`.
`bootstrap-native-gG74wv` preserves the failed owned2 run. Its debugger recovery
failed before the requested lookup/show executed and coincided with process exit
without an application cleanup acknowledgement; normal cleanup is **not** claimed.
`bootstrap-native-WHfMHQ` identifies the intermediate constructor's zero-size
onscreen record and acknowledged cancellation. `bootstrap-native-ueg1bw` contains
the corrected native cases and their exact per-case results. See the
[native bootstrap record](../native/bootstrap/README.md) for current validation.

# Step 7.5: Sophon healthy, launcher hidden

On September 12, 2026, the development launcher at
`0f5b4bf7b0d11daa747c78842d7bf1bec2b3796f` remained hidden after Sophon's
initial health check failed. The strongest evidence identifies a window/bootstrap
dependency: the hidden macOS WebView stalled the retry and deadline timers, while
the application waited for those operations before showing the window.

The working tree was clean before this fix. `origin/main` was
`514ebed106dc8c3b986a655d39d5bded8753941b` (nine ahead, zero behind).

## Diagnosis before production edits

1. **Binding:** both the user's captured `port-45233.txt` and live `lsof` showed
   Sophon PID **24088**, parent Neutralino PID **24058**, listening on
   **127.0.0.1:45233**. It was already listening when the user's evidence was
   captured. There was no current pre-listen blockage to diagnose.
2. **Health request:** [the client](../src/sophon.ts) requests
   **`http://127.0.0.1:45233/health`**. Read-only GETs returned HTTP 200 and
   `{"status":"healthy",...}`. The [server route](../sophon_server/server.py)
   performs no game operation. Its CORS middleware returned
   `Access-Control-Allow-Origin: *` for the launcher's HTTP localhost origin.
3. **Initial transport failure:** the native log records the child PID at
   04:11:37.829 and `TypeError: Load failed` at 04:11:37.841, only **12 ms** later.
   A request before the compiled Python server starts listening is consistent
   with this failure. The log lacks the original network error detail and exact
   listen time, so connection refusal at that instant is an inference. The
   persistent failure is separately established: there is only one retry log,
   with neither the 3-second retry nor the 30-second deadline firing for over
   20 minutes after the server was ready.
4. **Environment:** `server.py` passes `SOPHON_HOST` and integer `SOPHON_PORT` to
   `uvicorn.run`. The observed nondefault port 45233, instead of the fallback
   8000, confirms the built process honors its environment. The bound address
   also matches the requested host.
5. **Artifact actually executed:** the process's mapped executable and cwd,
   reported by `lsof`, are respectively
   `/Users/david/code/home/yaagl_vibecoding/yet-another-anime-game-launcher/sidecar/sophon_server/sophon-server`
   and the repository root. The executable is **42,838,112 bytes**, SHA-256
   **`1e2729d9b1b8821de2123c790e47fad2dfffabb1aa2d3480a89c6645437659c9`**.
   It matches both `sophon_server/build/server.dist/sophon-server` and
   `yaaglwdos/sidecar/sophon_server/sophon-server`. It is a Mach-O x86_64 build.
6. **Cwd/resource lookup:** [the launch command](../src/clients/mhy/hk4e/index.tsx)
   is relative to the native process cwd. The development `--path=./yaaglwdos`
   selects the resource/profile root; it does not change the shell cwd.
   Consequently, the root `sidecar` executable is used here. In
   [sophon_api.py](../sophon_server/sophon_api.py), hpatchz is resolved relative
   to `__file__`, with a colocated `hpatchz` fallback. That file is present.
   [tasks.py](../sophon_server/tasks.py) uses a cwd-relative game metadata cache
   later; `/health` does not use that cache.
7. **Staging completeness:** SHA-256 and size comparison of all **19 files** in
   the build distribution against both staged directories found **zero missing
   or changed files**. The live health response also establishes successful
   imports and FastAPI startup. No missing initialization resource was found;
   this does not certify resources required by every later game operation.
8. **Loopback in this native build:** an isolated instance of the same
   `bin/hk4e-neutralino-arm64` (**4.11.0-yaagl-owned1**) fetched the live Sophon
   health endpoint through **both localhost and 127.0.0.1** from its actual
   WebView. Both returned HTTP 200, including while that fixture was hidden.
   Thus curl success is supplemented by WebView evidence; there is no observed
   persistent hostname, CORS or WebView networking failure for these requests.
9. **Window gate:** [src/index.tsx](../src/index.tsx) previously called
   `window.show()` only after `createApp()` resolved. [createApp](../src/app.tsx)
   awaits creation of the HK4E client, which awaits Sophon health/retry.
   [neutralino.config.json](../neutralino.config.json) starts the window hidden.
   Both retry and [timeout](../src/utils/helper.ts) use JavaScript timers.
10. **Dock without recovery UI:** the native AppKit run loop and sidecar continue
    independently of the hidden page's timers. Neither successful rendering nor
    the timeout rejection/fatal path is reached. The initial root is empty and
    no startup failure text is rendered by the old entry point. The local native
    normal-quit veto deliberately waits for JavaScript's guarded exit; automatic
    native termination would defeat the ownership contract and is not a fix.

The isolated timing probe scheduled 3- and 8-second timers at 08:36:25.448 UTC.
Both were still pending at 08:36:37.587, with `window.isVisible()` false.
Showing **only that disposable fixture's window** at 08:36:37.588 made the
timers fire at 08:36:37.591–592. The fixture then exited normally with code 0.
The original launcher and Sophon were not shown, restarted or signaled.

## Fix and regression evidence

The entry point now displays `Starting launcher…`, awaits `window.show()`, then
starts `createApp()`. It still renders the launcher only after successful
initialization. Failure leaves visible error text and calls the existing `fatal`
handler, including its guarded shutdown. Sophon health checks, retries and
deadlines, normal-close hooks, launch ownership, Wine selection and cleanup are
unchanged. There is no new retry of application-wide setup or sidecar spawn.

[src/index.spec.ts](../src/index.spec.ts) tests the actual entry point's order,
delayed window acknowledgement, the real Sophon client's failed-then-successful
health check, exhaustion of health retries, and native window-show failure.

[scripts/test-bootstrap.cjs](../scripts/test-bootstrap.cjs) builds the actual
entry point and Sophon client, then runs them in the existing local native
WebView with the production `hidden: true` configuration. Only application
setup and the fatal dialog/exit are replaced with fixture boundaries. The build
rejects accidental inclusion of the real application setup or Wine modules.
There is no Wine, game, working profile or real sidecar execution in this test.

Both native cases passed, and both screenshots were visually inspected:

- One failed health response followed by a 3-second retry: **2 requests**;
  window visible before setup; launcher fixture rendered only after health passed.
- Service always returns 503: **10 requests**; the existing 30-second deadline
  produces visible `Launcher startup failed. Error: Fail to launch sophon.`;
  launcher fixture never renders. The fixture intercepts the fatal dialog to
  record this result. This is not a new live test of production shutdown hooks.

The two native fixtures exited through their private native endpoints with code 0. Evidence is retained under
`.tmp/step7.5/bootstrap-no-window/`, including `hidden-window-probe.txt`,
`native-regression/`, `vitest-after-fix.txt` and `build-after-fix.txt`.

Run from `/Users/david/code/home/yaagl_vibecoding/yet-another-anime-game-launcher`:

```sh
npm exec --yes --package=node@16.20.2 --package=pnpm@7.33.7 --call 'pnpm test src/index.spec.ts'
npm exec --yes --package=node@16.20.2 --package=pnpm@7.33.7 --call 'node scripts/test-bootstrap.cjs'
npm exec --yes --package=node@16.20.2 --package=pnpm@7.33.7 --call 'pnpm test'
npm exec --yes --package=node@16.20.2 --package=pnpm@7.33.7 --call 'pnpm exec tsc && pnpm run lint && pnpm run format-check'
npm exec --yes --package=node@16.20.2 --package=pnpm@7.33.7 --call 'YAAGL_CHANNEL_CLIENT=hk4eos pnpm exec vite build --mode=development --outDir=.tmp/bootstrap-hk4eos-build'
```

Results: **4 focused tests, 1,894 full Vitest tests**, TypeScript and formatting
passed; **9 existing lint warnings, zero errors**. The Global development bundle
built successfully, with the existing non-module `neutralino.js` and chunk-size
warnings. No dependency, lockfile, native runtime, Sophon artifact or Wine change
was needed. Configure/Sophon preparation was already complete and was not rerun.

## Operator retest

Quit the old development launcher using its normal Dock **Quit** action and wait
for it to exit before restarting it. If normal quit does not complete, retain
the logs and report that; do not start another instance or force Wine cleanup.
From the repository directory above, rerun:

```sh
npm exec --yes --package=node@16.20.2 --package=pnpm@7.33.7 --call 'pnpm run start-hk4eos'
```

Confirm the startup message becomes visible promptly, followed by the launcher
or a visible error. If startup fails, preserve `yaaglwdos/neutralinojs.log` and
terminal output. Do not press Launch during this bootstrap retest. The previous
instance was deliberately retained during diagnosis; a full restart using the
copied user profile remains an operator check. Neither these fixtures nor a
successful bootstrap establish real-game FPS or packaged-app readiness.
