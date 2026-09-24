#!/usr/bin/env python3
"""Compile and pin the narrow registry helper; no Wine execution."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parent.parent
p = argparse.ArgumentParser()
p.add_argument('--record', action='store_true')
a = p.parse_args()
out = root / 'sidecar/window-state/window-registry.exe'
out.parent.mkdir(parents=True, exist_ok=True)
source = root / 'native/window-state/registry.c'
args = ['x86_64-w64-mingw32-gcc', '-std=c11', '-O2', '-Wall', '-Wextra', '-Werror', '-municode', '-static', '-s',
        '-Wl,--no-insert-timestamp', str(source), '-ladvapi32', '-luser32', '-o', str(out)]
subprocess.run(args, check=True)
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
manifest = {'filename': out.name, 'size': out.stat().st_size, 'sha256': sha(out), 'sourceSha256': sha(source),
            'architecture': 'x86_64 PE', 'compiler': subprocess.check_output([args[0], '--version'], text=True).splitlines()[0]}
path = root / 'native/window-state/manifest.json'
if a.record:
    path.write_text(json.dumps(manifest, indent=2) + '\n')
else:
    assert json.loads(path.read_text()) == manifest, 'Helper differs: review source/toolchain before --record'
print(json.dumps(manifest))
