# Native launcher bootstrap

`bootstrap.cpp` is compiled into the repository-local macOS Neutralino runtime
by `scripts/build-hk4e-native.py`. Version `4.11.0-yaagl-owned3` retains the owned1
foreground-command dispatch and guarded normal-quit fixes. It adds only the
`custom.bootstrap` API permission. The API is exported by the existing
Neutralino client; no client library or dependency is replaced.

The WKWebView constructor no longer orders its initially zero-size window. The
configured non-hidden route explicitly shows its window; hidden startup leaves
it unordered until accepted DOM readiness.

Before navigation, hidden startup captures the WebView's existing public
`WKPreferences.inactiveSchedulingPolicy` and selects `None`. Native timers alone
cannot prevent WebKit from suspending delivery of RPC responses and normal-close
events. The original policy is restored only after accepted ready has shown the
initialized main window. Failed/cancelled startup retains `None` so the existing
JavaScript cleanup gate can finish while the main window remains hidden. This
uses the [public WebKit policy API](https://developer.apple.com/documentation/webkit/wkpreferences/inactiveschedulingpolicy-swift.property),
available on macOS 14 and later. Older systems receive an explicit native failure
before `createApp` admission; this candidate does not claim supported hidden
startup there. No private WebKit preference, transparent/offscreen window or
periodic visibility change is used.

The hidden window arms a 90-second native watchdog before navigation. This
bounds initialization across existing GitHub, Aria2, Sophon, metadata and image
waits. It does not delay successful startup. `wait` requests use a native
condition variable on RPC worker threads; they never block the AppKit or sole
WebSocket server thread. One steady-clock deadline is checked by begin/readiness admission and bounds every wait, so delayed watchdog delivery cannot extend the budget. Ready, failure and cancellation wake pending waits.

The frontend constructs services once, installs the initialized Solid DOM, then
sends `ready`. Only the first accepted ready transition shows the main window;
no paint, requestAnimationFrame, transparent window, offscreen window or early
startup status window is used. Service health and setup deadline helpers use the
native clock during initialization and retain normal DOM timers afterward.
Late readiness cannot revive a failed or cancelled startup.

Failures use a native nonmodal panel titled **Yaagl OS**, even if JavaScript
never loads. Panel Quit/close and normal Dock/window quit still dispatch the
existing `windowClose` event. The frontend stops new sidecar/configuration work,
waits for pending sidecar acknowledgements and cleanup-hook registration, then
uses `GLOBAL_onClose(false)` and the existing `app.exit`. No forced exit is
provided. A disconnected frontend or unknown sidecar acknowledgement can keep
cleanup guarded; the visible panel remains available for evidence collection.
Rejected/malformed sidecar acknowledgements and failed cleanup-hook registration remain unresolved and block exit; rejection does not establish that no child exists. Initial launcher patch recovery is queued only after native readiness succeeds, with a synchronous ownership reservation retained through its final acknowledgement. Unhandled restoration failures keep the close/launch guard; existing handled recovery inside the initializer remains intact.

All new AppKit work is called from native window creation/close on the main
thread or dispatched explicitly to the main queue. Existing `window.setTitle`
is also routed to that queue by upstream `router.cpp`.

The preceding owned2 delivery had deterministic Node coverage and static native
checks, but no actual WebView execution. That limitation mattered: the first
isolated native test on 2026-09-14 passed a three-second retry yet stalled after
three health requests (about six seconds) during permanent unavailability.
Native timers/main queue remained responsive while hidden JavaScript stopped
receiving results, including normal-close events. Its retained native failure
panel was preserved. Debugger recovery did not execute its requested lookup or
show and was followed by process exit without application cleanup acknowledgement;
that run remains failed, not a normal cleanup pass.

`scripts/test-bootstrap.cjs --prepare ABS_EVIDENCE_PARENT` now builds an isolated
fixture first. The prepared manifest binds source, native and resource hashes.
`--run ABS_PREPARED_ROOT` explicitly runs the prepared cases. The real entry point,
bootstrap session and Sophon retry are exercised, while build guards exclude real
`createApp`, game/Wine clients and sidecar setup. Native process-creation APIs are
denied. A loopback fixture server controls health responses; DOM timers and
animation-frame callbacks are intentionally frozen. Cases cover four-attempt
hidden retry success, permanent service failure, delayed cancellation with a
normal-close veto and subsequent acknowledgement, and the real 90-second native
watchdog. Each case captures hidden state, exact title/DOM, native window metadata,
visible result/failure screenshots and acknowledged normal process exit. Any
unresolved lifetime stops the suite without force-killing the fixture. These are
native fixtures, not packaged-application or gameplay acceptance.

On 2026-09-14, owned3 ARM64 native SHA-256
`c67e7eabd572ca7c96dd1ab547a67faa0bac8e08e4fb50e95dd1850af6571939`
passed all four actual native cases in `bootstrap-native-ueg1bw` under the local
`fps-autonomous-validation-20260914T130005Z` evidence root: four-request retry
9.656s, ten-request permanent failure30.556s, cancellation/veto10.813s and
watchdog95.099s (total run times including screenshots and normal cleanup).
The watchdog budget was90s; its native failure notification was delivered94.499s
after arming. Shared admission checks still use the elapsed90s deadline. Every
case recorded an empty initial onscreen-window list, zero fired DOM callbacks,
a cleanup acknowledgement and native exit0. Failure/cancel screenshots show the
native diagnostic panel while the main window stays hidden. Policy restoration
was recorded exactly once for readiness and never for failed/cancelled cases.

The configured-visible native-close fixture additionally passed with a positive
native visibility result and nonzero onscreen window dimensions, two independent
foreground Perl commands, normal-close veto, both completion acknowledgements
and native exit0. The preserved strengthened run is `yaagl-native-close-EZA5bW`.
Actual package startup/UI, pre-macOS14 fallback, and gameplay remain separate
checks; these fixtures contain none of the real application's setup/data.
