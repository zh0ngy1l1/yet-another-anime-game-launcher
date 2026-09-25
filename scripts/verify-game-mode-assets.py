#!/usr/bin/env python3
"""Check exact signed Game Mode assets, loader ABI and effective plist inputs."""
import argparse
import hashlib
import json
from pathlib import Path
import plistlib
import struct
import subprocess

root = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--resources', type=Path, help='Verify a packaged Contents/Resources tree')
args = parser.parse_args()
resources = args.resources
here = resources / 'sources/wine-game-mode' if resources else root / 'native/wine-game-mode'
assets = (resources or root) / 'sidecar/wine-game-mode'
manifest = json.loads((here / 'manifest.json').read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
for relative, digest in manifest['sourceFiles'].items():
    if resources:
        if relative.startswith('native/wine-r2/'):
            p = resources / 'runtime-r2' / Path(relative).name
        elif relative.startswith('native/'):
            p = resources / 'sources' / relative.removeprefix('native/')
        else:
            p = resources / 'sources' / Path(relative).name
    else:
        p = root / relative
    assert sha(p) == digest, relative
assert sorted(str(p.relative_to(assets)) for p in assets.rglob('*') if p.is_file()) == sorted(a['path'] for a in manifest['files'])
for asset in manifest['files']:
    p = assets / asset['path']
    assert not p.is_symlink() and sha(p) == asset['sha256'] and p.stat().st_size == asset['size'], p
    assert p.stat().st_mode & 0o777 == asset['mode'], p

def macho(path):
    data = path.read_bytes()
    assert struct.unpack_from('<I', data)[0] == 0xfeedfacf
    count = struct.unpack_from('<I', data, 16)[0]
    offset = 32
    segments = {}
    text = None
    plist = None
    for _ in range(count):
        cmd, size = struct.unpack_from('<II', data, offset)
        if cmd == 0x19:
            seg = struct.unpack_from('<II16sQQQQiiII', data, offset)
            segments[seg[2].rstrip(b'\0').decode()] = (seg[3], seg[4])
            for i in range(seg[9]):
                section = struct.unpack_from('<16s16sQQIIIIIIII', data, offset + 72 + i * 80)
                if section[0].rstrip(b'\0') == b'__info_plist':
                    plist = plistlib.loads(data[section[4]:section[4] + section[3]])
                if section[0].rstrip(b'\0') == b'__text':
                    text = data[section[4]:section[4] + section[3]]
        offset += size
    return segments, plist, text

# Signatures/filenames can differ while a stale object leaves the code identical.
# The real-Wine fixture additionally checks R2's protection behavior at runtime.
assert macho(assets / 'ntdll.so')[2] != macho(assets / 'ntdll-r2.so')[2], \
    'R2 has identical machine code to plain ntdll; rebuild the patched virtual.o'

app = assets / 'YAAGL HK4E.app'
for relative in ['wine', 'ntdll.so', 'ntdll-r2.so', 'YAAGL HK4E.app/Contents/MacOS/wine']:
    p = assets / relative
    subprocess.run(['codesign', '--verify', '--strict', str(p)], check=True)
    assert subprocess.check_output(['lipo', '-archs', str(p)], text=True).strip() == 'x86_64'
    deps = subprocess.check_output(['otool', '-L', str(p)], text=True)
    # The first dylib entry can be LC_ID_DYLIB (its name); inspect actual load commands.
    loads = subprocess.check_output(['otool', '-l', str(p)], text=True)
    assert 'path /Users/' not in loads and 'path /opt/' not in loads
    for block in loads.split('Load command'):
        if any('cmd ' + cmd + '\n' in block for cmd in ['LC_LOAD_DYLIB', 'LC_LOAD_WEAK_DYLIB', 'LC_REEXPORT_DYLIB']):
            dep = block.split('name ', 1)[1].split(' (offset', 1)[0]
            assert dep.startswith(('/usr/lib/', '/System/Library/', '@rpath/', '@loader_path/')), dep
    if relative.endswith('wine'):
        segments, info, _ = macho(p)
        assert segments['WINE_RESERVE'] == (0x1000, 0x1fffff000)
        assert segments['WINE_TOP_DOWN'] == (0x7ff000000000, 0x001ff0000)
        assert '_wine_main_preload_info' in subprocess.check_output(['nm', '-gU', str(p)], text=True)
        if relative != 'wine':
            assert info == plistlib.loads((app / 'Contents/Info.plist').read_bytes()) == plistlib.loads((here / 'Info.plist').read_bytes())
            assert info['CFBundleIdentifier'] == manifest['bundleIdentifier']
            assert info['LSSupportsGameMode'] is True and info['LSApplicationCategoryType'] == 'public.app-category.games'
            assert 'LSUIElement' not in info
        else:
            assert 'LSSupportsGameMode' not in info
subprocess.run(['codesign', '--verify', '--strict', str(app)], check=True)
print('Game Mode: pinned source/assets, x86_64 ABI, reservations, exports, matching plists, signatures and dependencies verified')
