#!/usr/bin/env python3
"""Exercise shipped routing with real CreateProcess, in a disposable Wine prefix.
No game/UI, FPS measurement, injected observer, or installed runtime modification.
"""
import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile

root = Path(__file__).resolve().parent.parent
p = argparse.ArgumentParser(description=__doc__)
p.add_argument('--runtime', type=Path, required=True)
a = p.parse_args()
base = json.loads((root / 'native/wine-r2/delta.json').read_text())
fullscreen = json.loads((root / 'native/wine-fullscreen/manifest.json').read_text())
gm = json.loads((root / 'native/wine-game-mode/manifest.json').read_text())
def run(*args, **kw):
    return subprocess.run(list(map(str, args)), check=True, **kw)
def win(path):
    return 'Z:' + str(path).replace('/', '\\')
with tempfile.TemporaryDirectory(prefix='yaagl-game-mode-wine-') as temporary:
    work = Path(temporary).resolve()
    prefix = work / 'prefix'; prefix.mkdir()
    parents = work / 'prepared'; parents.mkdir()
    fixture = work / 'parent.exe'
    run('x86_64-w64-mingw32-gcc', '-O2', '-municode', '-static',
        root / 'native/wine-game-mode/tests/child.c', '-o', fixture)
    helper = work / 'helper.exe'; shutil.copy2(fixture, helper)
    for fps, name in [(False, 'GenshinImpact.exe'), (True, 'YuanShen.exe')]:
        game = work / name; shutil.copy2(fixture, game)
        manifest = {**base, 'applyR2': fps, 'fullscreen': fullscreen,
                    'fullscreenAssets': str(root / 'sidecar/wine-fullscreen'),
                    'gameMode': gm, 'gameModeAssets': str(root / 'sidecar/wine-game-mode'),
                    'gameModeExecutable': str(game), 'gameModePrefix': str(prefix)}
        prep = run('perl', root / 'src/clients/mhy/hk4e/prepare-r2.pl', a.runtime.resolve(), parents,
                   json.dumps(manifest), capture_output=True, text=True)
        runtime = Path(prep.stdout.strip())
        environment = {**os.environ, 'WINEPREFIX': str(prefix), 'WINEDEBUG': '-all',
                       'WINEDLLOVERRIDES': 'mscoree,mshtml=', 'YAAGL_GAME_MODE_IMAGE': '',
                       'YAAGL_GAME_MODE_REQUEST': str(runtime / 'lib/wine/x86_64-unix/yaagl-game-mode.request')}
        try:
            # Wine boot, registry, ordinary parent, and a name-spoofing helper stay unbundled.
            boot = run(runtime / 'bin/wine', 'wineboot', '-u', env=environment, cwd=work, capture_output=True, text=True)
            assert 'yaagl-game-mode: host pid=' not in boot.stderr
            for actual, decoy, count in [(helper, game.name, 0), (game, helper.name, 1)]:
                result = run(runtime / 'bin/wine', win(fixture), win(actual), decoy,
                             env=environment, cwd=work, capture_output=True, text=True)
                assert result.stderr.count('yaagl-game-mode: host pid=') == count, result.stderr
                assert 'child exit=37' in result.stdout and 'arguments/environment/handle retained' in result.stdout, result
                assert (work / 'inherited.txt').read_bytes() == b'inherited'
                print('PASS resolved image beats command-line name; context/exit preserved', fps, actual.name)
        finally:
            # No timeout/forced kill. Completion precedes private runtime disposal.
            run(runtime / 'bin/wineserver', '-w', env=environment)
        shutil.rmtree(runtime.parent)
    assert not list(parents.iterdir())
print('Real Wine child routing and ordinary completion/cleanup passed')
