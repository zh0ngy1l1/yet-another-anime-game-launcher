#!/usr/bin/env python3
"""Developer-only rebuild of the Wine 11.0 Game Mode assets from pinned source.
Normal app builds verify/use the tracked assets; they never compile Wine.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import plistlib
import shutil
import subprocess

root = Path(__file__).resolve().parent.parent
here = root / 'native/wine-game-mode'
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--work', type=Path, default=root / '.tmp/wine-game-mode')
parser.add_argument('--record', action='store_true')
args = parser.parse_args()
work = args.work.resolve()
source = work / 'wine-wine-11.0'
stage = work / 'game-mode-assets'
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
def run(*args, **kw):
    subprocess.run(list(map(str, args)), check=True, **kw)
env = {**os.environ, 'YAAGL_WINE_WORK': str(work),
       'PATH': '/opt/homebrew/opt/bison/bin:' + os.environ['PATH']}
if not source.exists():
    run('python3', root / 'native/wine-fullscreen/prepare-sources.py', env=env)
# No pre-existing native changes can enter these artifacts unnoticed.
diff = subprocess.check_output(['git', 'diff', 'yaagl-baseline', '--', 'dlls/ntdll'], cwd=source)
assert not diff, 'Use a fresh --work: ntdll has changes'
run('git', 'apply', here / 'resolved-image.patch', cwd=source)
run('bash', root / 'native/wine-fullscreen/configure-engine.sh', env=env)
stage.mkdir(exist_ok=True)
ntdll = {}
for name in ('plain', 'r2'):
    if name == 'r2':
        run('git', 'apply', root / 'native/wine-r2/0001-ntdll-use-current-protection-for-rosetta-toggle.patch', cwd=source)
        text = (source / 'dlls/ntdll/unix/virtual.c').read_text()
        start = text.index('static void toggle_executable_pages_for_rosetta(')
        helper = text[start:text.index('\n}', start) + 3]
        provenance = json.loads((root / 'native/wine-r2/provenance.json').read_text())
        assert hashlib.sha256(helper.encode()).hexdigest() == provenance['correction']['helper_utf8_sha256']
    run('make', '-C', work / 'build', '-j8', 'dlls/ntdll/ntdll.so', env=env)
    dest = stage / ('ntdll.so' if name == 'plain' else 'ntdll-r2.so')
    shutil.copy2(work / 'build/dlls/ntdll/ntdll.so', dest)
    loads = subprocess.check_output(['otool', '-l', str(dest)], text=True).splitlines()
    rpaths = [loads[i+2].split('path ', 1)[1].split(' (offset', 1)[0]
              for i, line in enumerate(loads) if line.strip() == 'cmd LC_RPATH']
    flags = []
    for path in rpaths:
        if path.startswith(str(work)): flags += ['-delete_rpath', path]
    for path in ('@loader_path/../..', '@loader_path/../../GStreamer.framework/Versions/1.0/lib'):
        if path not in rpaths: flags += ['-add_rpath', path]
    if flags: run('install_name_tool', *flags, dest)
    run('codesign', '--force', '--sign', '-', dest)
    ntdll[name] = {'path': dest.name, 'sha256': sha(dest), 'size': dest.stat().st_size}

(work / 'compatible-ntdll.h').write_text(''.join(
    f'#define YAAGL_NTDLL_{name.upper()} "{asset["sha256"]}"\n' for name, asset in ntdll.items()))
flags = ['-arch', 'x86_64', '-m64', '-O2', '-mmacosx-version-min=14.0',
         '-fPIE', '-fvisibility=hidden', '-fno-stack-protector', '-fno-strict-aliasing',
         '-fcf-protection=none', '-U_FORTIFY_SOURCE', '-D_FORTIFY_SOURCE=0',
         '-I' + str(work), '-Wno-deprecated-declarations']
for host in (False, True):
    app = stage / 'YAAGL HK4E.app'
    dest = app / 'Contents/MacOS/wine' if host else stage / 'wine'
    dest.parent.mkdir(parents=True, exist_ok=True)
    info = here / 'Info.plist'
    if host:
        shutil.copy2(info, app / 'Contents/Info.plist')
    else:
        info = work / 'ordinary.plist'
        original = (source / 'loader/wine_info.plist.in').read_text().replace('@PACKAGE_VERSION@', '11.0')
        info.write_text(original)
        assert 'LSSupportsGameMode' not in plistlib.loads(info.read_bytes())
    run('clang', *flags, *(['-DYAAGL_GAME_HOST'] if host else []), here / 'loader.c', '-o', dest,
        '-Wl,-segalign,0x1000,-pagezero_size,0x1000,-sectcreate,__TEXT,__info_plist,' + str(info),
        '-Wl,-no_pie,-image_base,0x200000000,-no_huge,-no_fixup_chains,'
        '-segaddr,WINE_RESERVE,0x1000,-segaddr,WINE_TOP_DOWN,0x7ff000000000')
    run('codesign', '--force', '--sign', '-', app if host else dest)
    run('codesign', '--verify', '--strict', app if host else dest)

manifest = {
    'schema': 1, 'wineCommit': 'db11d0fe6a169c457e23d007e20404643d067aa8',
    'overlayCommit': '0d029255bce8f2f4ac47a1984b59ba82e09d9829',
    'baseArchiveSha256': '4ebba536115e937c3826fa5808dbed50cd5e91c8454999b54cbe0cd2a43d8b4c',
    'bundleIdentifier': 'com.zh0ngy1l1.yaagl.hk4e-game',
    'architecture': 'x86_64', 'deploymentTarget': '14.0',
    'compiler': subprocess.check_output(['clang', '--version'], text=True).splitlines()[0],
    'sdk': subprocess.check_output(['xcrun', '--show-sdk-version'], text=True).strip(),
    'inputLoaderSha256': sha(work / 'runtime/lib/wine/x86_64-unix/wine'),
    'ntdll': ntdll,
    'sourceFiles': {str(p.relative_to(root)): sha(p) for p in (
        here / 'loader.c', here / 'main.h', here / 'routing.h', here / 'Info.plist', here / 'resolved-image.patch',
        root / 'native/wine-r2/0001-ntdll-use-current-protection-for-rosetta-toggle.patch',
        root / 'native/wine-fullscreen/prepare-sources.py', root / 'native/wine-fullscreen/configure-engine.sh',
        root / 'scripts/build-game-mode.py')},
    'files': [{'path': str(p.relative_to(stage)), 'sha256': sha(p), 'size': p.stat().st_size,
               'mode': p.stat().st_mode & 0o777}
              for p in sorted(stage.rglob('*')) if p.is_file()],
}
if args.record:
    shutil.copytree(stage, root / 'sidecar/wine-game-mode', dirs_exist_ok=True)
    (here / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
else:
    assert json.loads((here / 'manifest.json').read_text()) == manifest, 'Inspect changed build before --record'
print(json.dumps(manifest, indent=2))
