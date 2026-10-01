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
import struct

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
if stage.exists(): shutil.rmtree(stage)
stage.mkdir()
ntdll = {}
for name in ('plain', 'r2'):
    if name == 'r2':
        run('git', 'apply', root / 'native/wine-r2/0001-ntdll-use-current-protection-for-rosetta-toggle.patch', cwd=source)
        text = (source / 'dlls/ntdll/unix/virtual.c').read_text()
        start = text.index('static void toggle_executable_pages_for_rosetta(')
        helper = text[start:text.index('\n}', start) + 3]
        provenance = json.loads((root / 'native/wine-r2/provenance.json').read_text())
        assert hashlib.sha256(helper.encode()).hexdigest() == provenance['correction']['helper_utf8_sha256']
        # Apple's make 3.81 compares whole seconds. The patch can land in the
        # same second as the plain object, so timestamps cannot select R2.
        # Invalidate exactly the changed object and its linked output.
        for relative in ('dlls/ntdll/unix/virtual.o', 'dlls/ntdll/ntdll.so'):
            (work / 'build' / relative).unlink()
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
# The publisher's pinned shortcut icon provides a sealed fallback before Wine
# can read the Windows image's icon. Normal builds use the tracked signed assets.
icon_source = json.loads((here / 'icon-source.json').read_text())
icon = here / 'genshin.ico'
assert sha(icon) == icon_source['sha256']
assert hashlib.md5(icon.read_bytes()).hexdigest() == icon_source['publisherMd5']
data = icon.read_bytes()
assert struct.unpack_from('<HH', data) == (0, 1)
png = None
for i in range(struct.unpack_from('<H', data, 4)[0]):
    width, height, _, _, _, _, size, offset = struct.unpack_from('<BBBBHHII', data, 6 + 16*i)
    candidate = data[offset:offset + size]
    if width == 0 and height == 0 and candidate.startswith(b'\x89PNG\r\n\x1a\n'):
        png = candidate
assert png, 'Pinned shortcut must contain its 256px PNG representation'
image = work / 'game-icon.png'; image.write_bytes(png)
iconset = work / 'GameIcon.iconset'; iconset.mkdir(exist_ok=True)
for name, size in [('16x16', 16), ('16x16@2x', 32), ('32x32', 32), ('32x32@2x', 64),
                   ('128x128', 128), ('128x128@2x', 256), ('256x256', 256)]:
    run('sips', '-z', size, size, image, '--out', iconset / ('icon_' + name + '.png'),
        stdout=subprocess.DEVNULL)
icns = work / 'GameIcon.icns'
run('iconutil', '-c', 'icns', iconset, '-o', icns)
hosts = {'GenshinImpact.exe': 'hosts/global/YAAGL HK4E.app',
         'YuanShen.exe': 'hosts/cn/YAAGL HK4E.app'}
for region in (None, 'global', 'cn'):
    host = region is not None
    app = stage / ('hosts/' + region + '/YAAGL HK4E.app') if host else None
    dest = app / 'Contents/MacOS/wine' if host else stage / 'wine'
    dest.parent.mkdir(parents=True, exist_ok=True)
    info = here / ('Info-cn.plist' if region == 'cn' else 'Info.plist')
    if host:
        shutil.copy2(info, app / 'Contents/Info.plist')
        (app / 'Contents/Resources').mkdir()
        shutil.copy2(icns, app / 'Contents/Resources/GameIcon.icns')
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
    'ntdll': ntdll, 'hosts': hosts,
    'sourceFiles': {str(p.relative_to(root)): sha(p) for p in (
        here / 'loader.c', here / 'main.h', here / 'routing.h', here / 'Info.plist', here / 'Info-cn.plist',
        here / 'genshin.ico', here / 'icon-source.json', here / 'resolved-image.patch',
        root / 'native/wine-r2/0001-ntdll-use-current-protection-for-rosetta-toggle.patch',
        root / 'native/wine-fullscreen/prepare-sources.py', root / 'native/wine-fullscreen/configure-engine.sh',
        root / 'scripts/build-game-mode.py')},
    'files': [{'path': str(p.relative_to(stage)), 'sha256': sha(p), 'size': p.stat().st_size,
               'mode': p.stat().st_mode & 0o777}
              for p in sorted(stage.rglob('*')) if p.is_file()],
}
if args.record:
    shutil.rmtree(root / 'sidecar/wine-game-mode')
    shutil.copytree(stage, root / 'sidecar/wine-game-mode')
    (here / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
else:
    assert json.loads((here / 'manifest.json').read_text()) == manifest, 'Inspect changed build before --record'
print(json.dumps(manifest, indent=2))
