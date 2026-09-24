#!/usr/bin/env python3
"""Loader entry fixture: same PID/argv/cwd/fds, effective bundle and fail-closed binding.
Uses an explicitly test-built host admitting a probe ntdll; shipped hashes are never changed.
"""
import hashlib
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import tempfile

root = Path(__file__).resolve().parent.parent
source = root / 'native/wine-game-mode'
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
def run(*args):
    subprocess.run(list(map(str, args)), check=True)
with tempfile.TemporaryDirectory(prefix='yaagl-host-entry-') as temp:
    directory = Path(temp).resolve()
    native = directory / 'relocated runtime'; native.mkdir()
    prefix = directory / 'prefix'; prefix.mkdir()
    game = directory / 'GenshinImpact.exe'; game.write_text('not a PE; never executed')
    helper = directory / 'steam.exe'; helper.write_text('not a PE; never executed')
    shutil.copy2(root / 'sidecar/wine-game-mode/wine', native / 'wine')
    ntdll = native / 'ntdll.so'
    run('clang', '-arch', 'x86_64', '-dynamiclib', '-mmacosx-version-min=14.0',
        '-framework', 'Foundation', source / 'tests/entry-probe.m', '-o', ntdll)
    (directory / 'compatible-ntdll.h').write_text(f'#define YAAGL_NTDLL_PLAIN "{sha(ntdll)}"\n#define YAAGL_NTDLL_R2 "{sha(ntdll)}"\n')
    app = native / 'YAAGL HK4E.app'; host = app / 'Contents/MacOS/wine'
    host.parent.mkdir(parents=True)
    shutil.copy2(source / 'Info.plist', app / 'Contents/Info.plist')
    run('clang', '-arch', 'x86_64', '-O2', '-mmacosx-version-min=14.0', '-fvisibility=hidden',
        '-fno-stack-protector', '-DYAAGL_GAME_HOST', '-Wno-deprecated-declarations', '-I'+str(directory),
        source / 'loader.c', '-o', host,
        '-Wl,-segalign,0x1000,-pagezero_size,0x1000,-sectcreate,__TEXT,__info_plist,' + str(source / 'Info.plist'),
        '-Wl,-no_pie,-image_base,0x200000000,-no_huge,-no_fixup_chains,-segaddr,WINE_RESERVE,0x1000,-segaddr,WINE_TOP_DOWN,0x7ff000000000')
    run('codesign', '--force', '--sign', '-', app)
    request = native / 'yaagl-game-mode.request'
    request.write_text(f'YAAGL-HK4E-GAME-MODE-1\n{prefix}\n{game}\n{game.stat().st_dev} {game.stat().st_ino}\n{sha(ntdll)}\n')
    request.chmod(0o600)
    arguments = ['unchanged arbitrary argv[0]', 'decoy.exe', '', 'a "quote"', '$HOME; $(false)', '日本語']
    for image, enabled in [(None, False), (helper, False), (game, True)]:
        a, b = socket.socketpair()
        readfd, writefd = os.pipe()
        env = {'PATH': '/usr/bin:/bin', 'WINEPREFIX': str(prefix), 'WINELOADERNOEXEC': '1',
               'WINESERVERSOCKET': str(a.fileno()), 'YAAGL_GAME_MODE_REQUEST': str(request),
               'YAAGL_TEST_FD': str(writefd), 'KEPT': 'a value\nwith whitespace'}
        if image: env['YAAGL_GAME_MODE_IMAGE'] = str(image)
        child = subprocess.Popen(arguments, executable=native/'wine', env=env, cwd=directory,
                                 pass_fds=(writefd, a.fileno()), stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        os.close(writefd)
        stdout, stderr = child.communicate()
        assert child.returncode == 23, stderr
        observed = json.loads(stdout)
        assert observed['pid'] == child.pid and observed['arguments'] == arguments
        assert observed['cwd'] == str(directory) and os.read(readfd, 8) == b'kept'
        os.close(readfd); a.close(); b.close()
        assert Path(observed['executable']).resolve() == (host if enabled else native/'wine')
        assert observed['gameMode'] == enabled
        if enabled: assert observed['bundle'] == 'com.zh0ngy1l1.yaagl.hk4e-game'
        observed['environment'].pop('__CF_USER_TEXT_ENCODING', None)
        env.pop('YAAGL_GAME_MODE_IMAGE', None)
        assert observed['environment'] == env
        print('PASS loader context, PID, preloader export and effective bundle', image)
    for defect in ['missing-host', 'ntdll', 'request-runtime', 'prefix', 'target-inode']:
        a, b = socket.socketpair()
        env.update(YAAGL_GAME_MODE_IMAGE=str(game), WINESERVERSOCKET=str(a.fileno()))
        original_ntdll = ntdll.read_bytes()
        original_request = request.read_text()
        if defect == 'missing-host': host.rename(host.with_name('missing'))
        if defect == 'ntdll': ntdll.write_bytes(b'mismatch')
        if defect == 'request-runtime': env['YAAGL_GAME_MODE_REQUEST'] = str(directory/'unrelated')
        if defect == 'prefix': env['WINEPREFIX'] = str(directory)
        if defect == 'target-inode': request.write_text(original_request.replace(f'{game.stat().st_dev} {game.stat().st_ino}', '0 0'))
        result = subprocess.run(arguments, executable=native/'wine', env=env, pass_fds=(a.fileno(),), capture_output=True)
        assert result.returncode == 1 and b'yaagl-game-mode:' in result.stderr, (defect, result)
        if defect == 'missing-host': host.with_name('missing').rename(host)
        ntdll.write_bytes(original_ntdll); request.write_text(original_request)
        env.update(YAAGL_GAME_MODE_REQUEST=str(request), WINEPREFIX=str(prefix))
        a.close(); b.close()
        print('PASS required host rejects', defect)
