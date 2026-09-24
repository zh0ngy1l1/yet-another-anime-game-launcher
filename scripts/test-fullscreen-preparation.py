#!/usr/bin/env python3
"""Exact private-runtime composition tests; never executes Wine/game."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
p=argparse.ArgumentParser();p.add_argument('--runtime',type=Path,required=True);a=p.parse_args()
r=Path(__file__).resolve().parent.parent
base=json.loads((r/'native/wine-r2/delta.json').read_text()); fs=json.loads((r/'native/wine-fullscreen/manifest.json').read_text())
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
with tempfile.TemporaryDirectory(prefix='yaagl-fullscreen-prep-') as tmp:
    root=Path(tmp).resolve();source=root/'source';parent=root/'copies';parent.mkdir()
    paths=['lib/wine/x86_64-unix/ntdll.so',*base['pins'],*(x['path'] for x in fs['outputs'])]
    for name in paths:
        dst=source/name;dst.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(a.runtime/name,dst)
    before={name:sha(source/name) for name in paths}
    for fps in [False,True]:
        for fullscreen in [False,True]:
            m={**base,'applyR2':fps}
            if fullscreen:m.update(fullscreen=fs,fullscreenAssets=str(r/'sidecar/wine-fullscreen'))
            result=subprocess.run(['perl',str(r/'src/clients/mhy/hk4e/prepare-r2.pl'),str(source),str(parent),json.dumps(m)],capture_output=True,text=True,check=True)
            copy=Path(result.stdout.strip())
            assert sha(copy/paths[0])==(base['outputSha256'] if fps else before[paths[0]])
            for name in paths[1:]:
                asset=next((x for x in fs['outputs'] if x['path']==name),None)
                assert sha(copy/name)==(asset['sha256'] if fullscreen and asset else before[name])
                assert (source/name).stat().st_ino!=(copy/name).stat().st_ino
            assert {name:sha(source/name) for name in paths}==before
            print('PASS composition',fps,fullscreen)
    m={**base,'applyR2':False,'fullscreen':fs,'fullscreenAssets':str(r/'sidecar/wine-fullscreen')}
    for asset in fs['outputs']:
        p=source/asset['path'];original=p.read_bytes();p.write_bytes(b'wrong driver')
        existing=set(parent.iterdir())
        result=subprocess.run(['perl',str(r/'src/clients/mhy/hk4e/prepare-r2.pl'),str(source),str(parent),json.dumps(m)],capture_output=True,text=True)
        assert result.returncode and 'Unsupported fullscreen driver input' in result.stderr
        assert set(parent.iterdir())==existing;p.write_bytes(original)
        print('PASS incompatible module rejects before copy',asset['path'])
print('7 fullscreen composition tests passed; no Wine execution')
