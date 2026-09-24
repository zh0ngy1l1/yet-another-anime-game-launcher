#!/usr/bin/env python3
"""Verify shipped assets and their build/source binding without executing Wine."""
import hashlib
import json
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parent.parent
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
manifest = json.loads((root / 'native/wine-fullscreen/manifest.json').read_text())
assert sha(root / 'native/wine-fullscreen/allow-fixed-size-fullscreen.patch') == manifest['patchSha256']
for a in manifest['outputs']:
    path = root / 'sidecar/wine-fullscreen' / a['path']
    assert path.is_file() and not path.is_symlink() and path.stat().st_size == a['size'] and sha(path) == a['sha256'], path
    if a['signed']:
        subprocess.run(['codesign', '--verify', '--strict', str(path)], check=True)
        result = subprocess.check_output(['otool', '-L', str(path)], text=True)
        assert all(line.strip().startswith(('@rpath/', '/System/', '/usr/lib/')) for line in result.splitlines()[1:])
a = json.loads((root / 'native/window-state/manifest.json').read_text())
assert sha(root / 'native/window-state/registry.c') == a['sourceSha256']
assert sha(root / 'sidecar/window-state' / a['filename']) == a['sha256']
print('Fullscreen trio and registry helper: pinned bytes, source, dependencies and native signature verified')
