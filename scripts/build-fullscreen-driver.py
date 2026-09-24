#!/usr/bin/env python3
"""Build only the matched Mac driver trio from public pinned source/dependencies.
--record intentionally updates the shipped trio and manifest after source review.
No loader, server, ntdll or installed Wine is changed or executed.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess

root = Path(__file__).resolve().parent.parent
p = argparse.ArgumentParser()
p.add_argument('--work', type=Path, default=root / '.tmp/wine-fullscreen')
p.add_argument('--record', action='store_true')
p.add_argument('--package-only', action='store_true', help=argparse.SUPPRESS)
a = p.parse_args()
work = a.work.resolve()
here = root / 'native/wine-fullscreen'
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
def run(*args, **kw):
    subprocess.run(args, check=True, **kw)
env = {**os.environ, 'YAAGL_WINE_WORK': str(work), 'PATH': '/opt/homebrew/opt/bison/bin:' + os.environ['PATH']}
if not a.package_only:
    if not (work / 'wine-wine-11.0').exists():
        run('python3', str(here / 'prepare-sources.py'), env=env)
    # Refuse stale/unrelated source trees, including a different patch.
    expected = (here / 'allow-fixed-size-fullscreen.patch').read_bytes()
    actual = subprocess.check_output(['git', 'diff', 'yaagl-baseline', '--', 'dlls/winemac.drv'], cwd=work / 'wine-wine-11.0')
    assert actual == expected, 'Prepared driver source differs from reviewed patch; use a fresh --work'
    run('bash', str(here / 'configure-engine.sh'), env=env)
    run('make', '-C', str(work / 'build'), '-j8', 'dlls/winemac.drv/all', env=env)
paths = {'lib/wine/x86_64-unix/winemac.so': 'winemac.so',
         'lib/wine/x86_64-windows/winemac.drv': 'x86_64-windows/winemac.drv',
         'lib/wine/i386-windows/winemac.drv': 'i386-windows/winemac.drv'}
stage = work / 'driver-assets'
stage.mkdir(exist_ok=True)
outputs = []
for relative, built in paths.items():
    dest = stage / relative
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(work / 'build/dlls/winemac.drv' / built, dest)
    if relative.endswith('.so'):
        lines = subprocess.check_output(['otool', '-l', str(dest)], text=True).splitlines()
        rpaths = [lines[i+2].split('path ', 1)[1].split(' (offset', 1)[0]
                  for i, line in enumerate(lines) if line.strip() == 'cmd LC_RPATH']
        args = []
        for rpath in rpaths:
            if rpath.startswith(str(work)): args += ['-delete_rpath', rpath]
        for rpath in ['@loader_path/../..', '@loader_path/../../GStreamer.framework/Versions/1.0/lib']:
            if rpath not in rpaths: args += ['-add_rpath', rpath]
        if args: run('install_name_tool', *args, str(dest))
        run('codesign', '--force', '--sign', '-', str(dest))
        run('codesign', '--verify', '--strict', str(dest))
        dependencies = subprocess.check_output(['otool', '-L', str(dest)], text=True)
        assert str(work) not in '\n'.join(dependencies.splitlines()[1:])
    outputs.append({'path': relative, 'inputSha256': sha(work / 'runtime' / relative),
                    'sha256': sha(dest), 'size': dest.stat().st_size, 'signed': relative.endswith('.so')})
manifest = {'schema': 1, 'wineCommit': 'db11d0fe6a169c457e23d007e20404643d067aa8',
            'overlayCommit': '0d029255bce8f2f4ac47a1984b59ba82e09d9829',
            'baseArchiveSha256': '4ebba536115e937c3826fa5808dbed50cd5e91c8454999b54cbe0cd2a43d8b4c',
            'legacyPatchCommit': 'd48bd81bfcd64b337c92d2b53d0dacc3321a9b41',
            'patchSha256': sha(here / 'allow-fixed-size-fullscreen.patch'),
            'architectures': ['x86_64 Mach-O', 'x86_64 PE', 'i386 PE'], 'deploymentTarget': '14.0',
            'compiler': subprocess.check_output(['clang', '--version'], text=True).splitlines()[0],
            'sdk': subprocess.check_output(['xcrun', '--show-sdk-version'], text=True).strip(),
            'outputs': outputs}
if a.record:
    shutil.copytree(stage, root / 'sidecar/wine-fullscreen', dirs_exist_ok=True)
    (here / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
else:
    assert json.loads((here / 'manifest.json').read_text()) == manifest, 'Build differs: inspect before --record'
print(json.dumps(manifest, indent=2))
