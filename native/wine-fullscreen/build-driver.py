#!/usr/bin/env python3
"""Build the review prototype in a private directory; never install its outputs."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess

here = Path(__file__).resolve().parent
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--work', required=True, type=Path)
parser.add_argument('--baseline', action='store_true', help='Build without the extraction patch for comparison')
args = parser.parse_args()
work = args.work.resolve()
env = {**os.environ, 'WINE_FULLSCREEN_WORK': str(work),
       'PATH': '/opt/homebrew/opt/bison/bin:/opt/homebrew/bin:' + os.environ['PATH']}
if args.baseline:
    env['WINE_FULLSCREEN_BASELINE'] = '1'
else:
    env.pop('WINE_FULLSCREEN_BASELINE', None)

def run(*command, **kwargs):
    subprocess.run(command, check=True, env=env, **kwargs)

source = work / 'wine-wine-11.0'
if not source.exists():
    run('python3', str(here / 'prepare-sources.py'))
baseline = subprocess.check_output(['git', 'rev-parse', 'fullscreen-baseline^{tree}'], cwd=source, text=True).strip()
if baseline != '763e3aa9df162f403f5ef8dcff995c5db58fc044':
    raise SystemExit('Unexpected source baseline; choose a fresh --work directory')
expected = b'' if args.baseline else (here / 'allow-fixed-size-fullscreen.patch').read_bytes()
actual = subprocess.check_output(['git', 'diff', 'fullscreen-baseline', '--'], cwd=source)
if actual != expected or subprocess.check_output(['git', 'ls-files', '--others', '--exclude-standard'], cwd=source):
    raise SystemExit('Source differs from the reviewed baseline/patch; choose a fresh --work directory')
run('bash', str(here / 'configure-engine.sh'))
run('make', '-C', str(work / 'build'), '-j8', 'dlls/winemac.drv/all')
stage = work / 'driver-assets'
outputs = []
for relative, built in {
    'lib/wine/x86_64-unix/winemac.so': 'winemac.so',
    'lib/wine/x86_64-windows/winemac.drv': 'x86_64-windows/winemac.drv',
    'lib/wine/i386-windows/winemac.drv': 'i386-windows/winemac.drv',
}.items():
    destination = stage / relative
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(work / 'build/dlls/winemac.drv' / built, destination)
    if relative.endswith('.so'):
        lines = subprocess.check_output(['otool', '-l', str(destination)], text=True).splitlines()
        rpaths = [lines[i+2].split('path ', 1)[1].split(' (offset', 1)[0]
                  for i, line in enumerate(lines) if line.strip() == 'cmd LC_RPATH']
        changes = []
        for path in rpaths:
            if path.startswith(str(work)):
                changes += ['-delete_rpath', path]
        for path in ['@loader_path/../..', '@loader_path/../../GStreamer.framework/Versions/1.0/lib']:
            if path not in rpaths:
                changes += ['-add_rpath', path]
        if changes:
            run('install_name_tool', *changes, str(destination))
        run('codesign', '--force', '--sign', '-', str(destination))
        run('codesign', '--verify', '--strict', str(destination))
        dependencies = subprocess.check_output(['otool', '-L', str(destination)], text=True)
        if str(work) in '\n'.join(dependencies.splitlines()[1:]):
            raise SystemExit('Build-directory dependency remains in staged driver')
    outputs.append({'path': relative, 'sha256': hashlib.sha256(destination.read_bytes()).hexdigest(),
                    'size': destination.stat().st_size})
(stage / 'build-record.json').write_text(json.dumps({
    'baselineTree': baseline, 'patchSha256': hashlib.sha256(expected).hexdigest() if expected else None,
    'compiler': subprocess.check_output(['clang', '--version'], text=True),
    'sdk': subprocess.check_output(['xcrun', '--show-sdk-version'], text=True).strip(),
    'outputs': outputs,
}, indent=2) + '\n')
print('Built for isolated testing only:', stage)
