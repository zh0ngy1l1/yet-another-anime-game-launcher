# Native launcher bootstrap

`bootstrap.cpp` is compiled into the repository-local macOS Neutralino runtime
by `scripts/build-hk4e-native.py`. Version `4.11.0-yaagl-owned2` retains the owned1
foreground-command dispatch and guarded normal-quit fixes. It adds only the
`custom.bootstrap` API permission. The API is exported by the existing
Neutralino client; no client library or dependency is replaced.

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

Validation for this revision is deliberately limited to deterministic Node
unit tests, TypeScript/lint/format checks, native compilation and static artifact
inspection. The tests freeze all DOM timers while independently advancing a
mock native clock. They cover health retries/deadlines, delayed readiness,
permanent failure, cancellation, spawn acknowledgement ordering, guarded quit
and one-time showing. They do not execute the application or validate actual
AppKit/WKWebView behavior. `scripts/test-bootstrap.cjs` documents the earlier
visible-startup candidate and was **not run** for this revision. Native launch,
WebView/RPC harnesses and game execution remain outside this validation.
