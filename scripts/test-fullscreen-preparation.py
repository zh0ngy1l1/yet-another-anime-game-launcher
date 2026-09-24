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
gm=json.loads((r/'native/wine-game-mode/manifest.json').read_text())
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
with tempfile.TemporaryDirectory(prefix='yaagl-fullscreen-prep-') as tmp:
    root=Path(tmp).resolve();source=root/'source';parent=root/'copies';parent.mkdir()
    paths=['lib/wine/x86_64-unix/ntdll.so',*base['pins'],*(x['path'] for x in fs['outputs']), 'lib/wine/x86_64-unix/wine']
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
    prefix=root/'prefix';prefix.mkdir()
    for fps in [False,True]:
        for name in ['GenshinImpact.exe','YuanShen.exe']:
            game=root/name;game.write_bytes(b'fixture only, never executed')
            m={**base,'applyR2':fps,'fullscreen':fs,'fullscreenAssets':str(r/'sidecar/wine-fullscreen'),
               'gameMode':gm,'gameModeAssets':str(r/'sidecar/wine-game-mode'),
               'gameModeExecutable':str(game),'gameModePrefix':str(prefix)}
            result=subprocess.run(['perl',str(r/'src/clients/mhy/hk4e/prepare-r2.pl'),str(source),str(parent),json.dumps(m)],capture_output=True,text=True,check=True)
            copy=Path(result.stdout.strip());native=copy/'lib/wine/x86_64-unix'
            expected=gm['ntdll']['r2' if fps else 'plain']['sha256']
            assert sha(native/'ntdll.so')==expected
            assert sha(native/'winemac.so')==fs['outputs'][0]['sha256']
            request=(native/'yaagl-game-mode.request').read_text().splitlines()
            assert request==['YAAGL-HK4E-GAME-MODE-1',str(prefix),str(game),f'{game.stat().st_dev} {game.stat().st_ino}',expected]
            receipt=json.loads((copy.parent/'receipt.json').read_text())
            assert receipt['outputSha256']==expected and receipt['gameMode']==gm
            assert {name:sha(source/name) for name in paths}==before
            print('PASS Game Mode/FPS/fullscreen composition and request binding',fps,name)
    assets=root/'bad-assets';shutil.copytree(r/'sidecar/wine-game-mode',assets)
    host=assets/'YAAGL HK4E.app/Contents/MacOS/wine';original=host.read_bytes()
    for defect in ['missing','mismatch','source-loader','prefix','target']:
        bad={**m,'gameModeAssets':str(assets)}
        old_loader=(source/paths[-1]).read_bytes()
        if defect=='missing':host.unlink()
        if defect=='mismatch':host.write_bytes(b'bad')
        if defect=='source-loader':(source/paths[-1]).write_bytes(b'wrong loader')
        if defect=='prefix':bad['gameModePrefix']='/does-not-exist'
        if defect=='target':bad['gameModeExecutable']=str(source/paths[0])
        existing=set(parent.iterdir())
        result=subprocess.run(['perl',str(r/'src/clients/mhy/hk4e/prepare-r2.pl'),str(source),str(parent),json.dumps(bad)],capture_output=True,text=True)
        assert result.returncode and set(parent.iterdir())==existing,(defect,result.stderr)
        host.write_bytes(original);(source/paths[-1]).write_bytes(old_loader)
        print('PASS Game Mode rejected before copy',defect)
print('16 fullscreen/Game Mode preparation cases passed; no Wine execution')
