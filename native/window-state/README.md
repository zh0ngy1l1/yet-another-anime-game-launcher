# HK4E window registry helper

MIT-licensed narrow helper, independent of the FPS worker/bridge. It never starts
a game or enumerates processes. Build intentionally with
`python3 scripts/build-window-state.py --record`; verify with
`python3 scripts/verify-fullscreen-assets.py`. The pinned PE asset is shipped in
`sidecar/window-state`, so normal app building and launch do not require a Wine
compile or artifact publication.

Commands: `save|apply|observe|restore DIRECTORY SERVER FULLSCREEN WIDTH HEIGHT CLAMP`.
Server is exactly hk4e_global or hk4e_cn. FULLSCREEN/CLAMP are 0/1. Zero dimensions
mean no resolution override. Save captures all requested raw preimages in one
CREATE_NEW snapshot, flushes it, then commits it before apply can run. A second
save cannot replace it. Apply requires that snapshot and the identical mutation
mask. Restore is idempotent, preserves raw types/bytes, removes absent values and
only deletes newly created keys/ancestors if still empty. Unrelated values and
subkeys survive. Observe reads only Unity's mode/width/height through registry APIs.
CLAMP bounds remembered geometry to Wine's current work area; explicit launcher
resolution is kept as requested. Retina, keyboard mappings, rendering and display
mode are outside this helper's mutation set.
