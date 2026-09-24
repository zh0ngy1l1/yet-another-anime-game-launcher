#!/usr/bin/env python3
"""Disposable Wine-only tests of raw preimages and narrow window controls."""
import argparse
import json
import os
from pathlib import Path
import subprocess
import tempfile
p = argparse.ArgumentParser();p.add_argument('--runtime', type=Path, required=True);a=p.parse_args()
repo=Path(__file__).resolve().parent.parent
helper=repo/'sidecar/window-state/window-registry.exe'
with tempfile.TemporaryDirectory(prefix='yaagl-window-registry-') as t:
    root=Path(t).resolve();env={**os.environ,'WINEPREFIX':str(root/'prefix'),'WINEDEBUG':'-all','WINEDLLOVERRIDES':'mscoree,mshtml='}
    def wine(*args, ok=True):
        r=subprocess.run([str(a.runtime/'bin/wine'),*map(str,args)],env=env,capture_output=True,text=True)
        assert (r.returncode == 0)==ok,(args,r.stdout,r.stderr)
        return r
    def run(op, directory, server='hk4e_global',fs='1',w='1152',h='648',clamp='0',ok=True):
        directory.mkdir(exist_ok=True)
        return wine(helper,op,'Z:'+str(directory).replace('/','\\'),server,fs,w,h,clamp,ok=ok)
    for server, exe, game in [('hk4e_global','GenshinImpact.exe','Genshin Impact'),('hk4e_cn','YuanShen.exe','原神')]:
        app='HKCU\\Software\\Wine\\AppDefaults\\'+exe
        key=app+'\\Mac Driver';gamekey='HKCU\\Software\\miHoYo\\'+game
        # This prefix belongs exclusively to this test.
        for case in ('absent','binary','dword','string'):
            subprocess.run([str(a.runtime/'bin/wine'),'reg','delete',app,'/f'],env=env,capture_output=True)
            subprocess.run([str(a.runtime/'bin/wine'),'reg','delete',gamekey,'/f'],env=env,capture_output=True)
            if case != 'absent':
                typ,data={'binary':('REG_BINARY','0001fe00ff'),'dword':('REG_DWORD','0x12345678'),'string':('REG_EXPAND_SZ','%literal%')}[case]
                wine('reg','add',key,'/v','AllowFixedSizeFullscreen','/t',typ,'/d',data,'/f')
                wine('reg','add',gamekey,'/v','Screenmanager Is Fullscreen mode_h3981298716','/t',typ,'/d',data,'/f')
                wine('reg','add',gamekey,'/v','Unrelated','/t','REG_SZ','/d','retain','/f')
            d=root/(server+'-'+case);run('save',d,server);before=(d/'window-registry.bin').read_bytes()
            run('apply',d,server);run('save',d,server,ok=False) # cannot recapture own override
            assert (d/'window-registry.bin').read_bytes()==before
            run('observe',d,server);current=json.loads((d/'current.json').read_text())
            assert (current['mode'],current['width'],current['height'])==(0,1152,648)
            run('restore',d,server);run('restore',d,server) # idempotent
            verify=root/(server+'-'+case+'-after');run('save',verify,server)
            assert (verify/'window-registry.bin').read_bytes()==before,(server,case,'raw preimage changed')
            if case=='absent':
                wine('reg','query',app,ok=False);wine('reg','query',gamekey,ok=False)
            else: assert 'retain' in wine('reg','query',gamekey,'/v','Unrelated').stdout
            print('PASS',server,case,'exact preimage, retry, absent-key cleanup')
        # Partial application + unrelated value in a newly made key: never delete it.
        subprocess.run([str(a.runtime/'bin/wine'),'reg','delete',app,'/f'],env=env,capture_output=True)
        d=root/(server+'-partial');run('save',d,server);run('apply',d,server)
        wine('reg','add',key,'/v','Keep','/t','REG_BINARY','/d','0100','/f');run('restore',d,server)
        wine('reg','query',key,'/v','Keep');wine('reg','query',key,'/v','AllowFixedSizeFullscreen',ok=False)
        print('PASS',server,'partial apply preserves unrelated values')
    subprocess.run([str(a.runtime/'bin/wineserver'),'-w'],env=env,check=True)
print('10 native registry cases passed; no game executed')
