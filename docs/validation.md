# Repository validation

Run from the repository root. These automated checks use synthetic data,
repository build output and temporary directories. They do not require an
installed game, launcher profile or application. See [build prerequisites](build-macos.md).

## Source, protocol and filesystem checks

```sh
npm exec --yes --package=node@16.20.2 --package=pnpm@7.33.7 --call 'pnpm install --frozen-lockfile'
python3 -c "from pathlib import Path; import base64; Path('src/clients/secret.ts').write_bytes(base64.b64decode(Path('src/clients/secret.b64').read_bytes()))"
python3 scripts/build-sophon.py --proto-only
npm exec --yes --package=node@16.20.2 --package=pnpm@7.33.7 --call 'pnpm run precommit && pnpm test && node scripts/build-fps-bridge.cjs && node scripts/test-fps-native.cjs && node scripts/test-owned-execution.cjs'
perl src/wine/owned-execution.t
for suite in full-update legacy service server online-info clone-guard clone-verifier; do
  uv run --project sophon_server --frozen --with httpx==0.28.1 python "scripts/test-sophon-$suite.py" || exit 1
done
python3 scripts/test-collect-hk4e-evidence.py
python3 scripts/test-hk4e-clone-launch-guard.py
git diff --check
```

`httpx` is needed only by FastAPI's test client; it is not a shipped dependency.
The metadata probe and independent verifier use the same pinned protocol compiler
as the build, generating their own schema modules without importing updater code.
The native portable tests use ASan/UBSan and retain live-memory-failure versus
process-termination regressions. Native PE compilation checks the recorded bridge
identity; a deliberate compiler/source change requires reviewing `--record`.

## Complete bundle and native fixtures

Build from a clean checkout with `./build-macos.sh`; its final step verifies every
packaged file, ASAR identity, native dependencies/signatures and four xdelta codec
round trips. China uses `YAAGL_CHANNEL_CLIENT=hk4ecn ./build-macos.sh`.

```sh
uv run --project sophon_server --frozen python scripts/test-sophon-bundle.py \
  'build/hk4eos/Yaagl OS.app/Contents/Resources/sidecar/sophon_server/sophon-server' --websocket
```

The bundle smoke test requests health, an unknown-task WebSocket and public online
metadata only. No install, update or repair request is submitted.

For real Wine fixtures, set `FPS_TEST_WINE` to an explicit standalone Wine loader
and run `node scripts/test-fps-bridge.cjs`, then the same command with `--steam`.
Both create fresh temporary prefixes and launch authored harmless fixtures only.
`scripts/test-r2-preparation.py --runtime WINE_ROOT --output RESULT` verifies APFS
copying, exact R2 bytes, links, pins and rejected inputs without launching Wine.
Use the pinned public runtime described in [R2 inputs](../native/wine-r2/README.md).
The native bootstrap, normal-close, rendered-settings and runtime RPC fixtures
remain separate entrypoints because they exercise different application boundaries.

## Explicit game validation tools

These are manual operations, separate from the source suite. The metadata-only
`probe-sophon.py` writes sanitized builds/manifests outside its game input.
`sophon-update.py --verify-only` audits through the production engine;
`verify-sophon-clone.py` independently audits saved official manifests, obsolete
assets, version anchors and original-file provenance. Do not merge their checks:
independent verification must remain independent of updater implementation.

Development writes through `sophon-update.py` require `--clone-of` and disjoint
canonical directories with no shared inodes. `test-sophon-clone-rest.py` performs
compiled-service repair on an independently verified clone. Runtime testing uses
`guard-hk4e-clone-launch.py` to verify profile selection, protect original paths
with Seatbelt, and compare original inventories. The common clone guard is shared;
the independent verifier retains its own manifest/path validation.
