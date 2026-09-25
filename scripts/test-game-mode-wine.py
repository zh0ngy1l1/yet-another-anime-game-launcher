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
p.add_argument('--game-mode-artifacts', type=Path,
               help='Archived manifest.json and wine-game-mode/ assets to check a prior build')
a = p.parse_args()
base = json.loads((root / 'native/wine-r2/delta.json').read_text())
fullscreen = json.loads((root / 'native/wine-fullscreen/manifest.json').read_text())
gm = json.loads(((a.game_mode_artifacts / 'manifest.json') if a.game_mode_artifacts else
                 (root / 'native/wine-game-mode/manifest.json')).read_text())
assets = a.game_mode_artifacts / 'wine-game-mode' if a.game_mode_artifacts else root / 'sidecar/wine-game-mode'
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
                    'gameMode': gm, 'gameModeAssets': str(assets.resolve()),
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
            memory = run(runtime / 'bin/wine', win(fixture), '--r2-parent', win(game),
                         env={**environment, 'WINEDEBUG': '-all,trace+virtual,+pid'},
                         cwd=work, capture_output=True, text=True)
            assert memory.stderr.count('yaagl-game-mode: host pid=') == 1, memory.stderr
            write = memory.stderr.split('YAAGL_R2_WRITE_BEGIN ', 1)[1].split('YAAGL_R2_WRITE_END ok=1', 1)[0]
            assert write.startswith('allocation=0x80 current=0x8 '), write
            # R2 must bypass the protection toggle for currently non-executable
            # data. The plain fixture proves the trace detects the old two calls.
            protects = [line for line in write.splitlines() if ':NtProtectVirtualMemory ' in line and
                        not line.split(':NtProtectVirtualMemory ', 1)[1].startswith('0xffffffffffffffff ')]
            assert len(protects) == (0 if fps else 2), protects
            print('PASS cross-process image-data write/readback; protection calls', fps, len(protects))
        finally:
            # No timeout/forced kill. Completion precedes private runtime disposal.
            run(runtime / 'bin/wineserver', '-w', env=environment)
        shutil.rmtree(runtime.parent)
    assert not list(parents.iterdir())
print('Real Wine child routing and ordinary completion/cleanup passed')
