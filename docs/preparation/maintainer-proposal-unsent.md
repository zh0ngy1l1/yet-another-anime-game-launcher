# Unsent maintainer proposal

Proposed channel: the launcher's published technical feature-request template,
or its linked Discord if maintainers prefer development discussion there.
No specific Discord development room has been verified. Nothing has been sent.
This draft requests direction, not acceptance of a ready-to-merge patch.

---

Would native macOS fullscreen for fixed-size game windows be of interest? It
would let users enter and leave a real Cocoa fullscreen Space using the ordinary
green button, while retaining the game's fixed-size window and restoring its
windowed geometry on exit.

I have prepared an AI-assisted
[source prototype](https://github.com/zh0ngy1l1/yet-another-anime-game-launcher/tree/prep/native-fullscreen-prototype-20261001/native/wine-fullscreen)
against Wine 11.0 and the matching MacPorts overlay. It adds a default-off
driver option, restricts eligibility to ordinary unowned fixed-size windows,
and handles saved geometry, pending transitions and late closing callbacks.
It contains no game-name checks, Unity geometry transport, cross-launch memory,
FPS/R2, Game Mode or launcher build-system replacement.

The prototype builds a matched native/PE driver set and includes isolated
Win32/Cocoa fixtures. The accompanying report preserves the earlier auxiliary
window failure and distinguishes baseline behavior, final-patch observations
and remaining gaps. An explicit owned-window update exposes a position-restoration failure,
retained as a submission blocker. One Apple Silicon/macOS configuration is available; compilation and
fixture passes do not establish broader compatibility or human review. The
working fork application has separate user acceptance.

I favor runtime-maintained opt-in support, with a later small YAAGL setting,
capability check and recoverable registry transaction. Existing unpatched
runtimes would keep their ordinary launch path. I noticed borderless PR #749
touches the same preparation/cleanup area and would coordinate that integration.

1. Is this feature within YAAGL's intended scope?
2. Should the native patch target the matching overlay branch, current Wine,
   or another source location?
3. Would the runtime distributor own rebasing/builds/releases, or would you
   prefer a separately maintained replacement-component approach?

---

Before sending, read the patch and validation blockers, obtain substantive
Wine/AppKit review, and decide what maintenance you can personally undertake.
Replace any claim you cannot explain or support. AI assistance is disclosed;
no human review or maintenance commitment is invented on your behalf.
