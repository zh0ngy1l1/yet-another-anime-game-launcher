#!/usr/bin/env python3
"""Build the local Intel helper against macOS liblzma, without Homebrew linkage."""
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile
import tarfile

repo = Path(__file__).resolve().parent.parent
source = repo / 'native/xdelta'
record = json.loads((source / 'inputs.json').read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
for name, expected in record['files'].items():
    assert sha(source / name) == expected, name
with tempfile.TemporaryDirectory(prefix='yaagl-xdelta-') as temporary:
    work = Path(temporary)
    with tarfile.open(source / 'xdelta-3.1.0.tar.gz') as archive:
        for item in archive.getmembers():
            assert not item.name.startswith('/') and '..' not in Path(item.name).parts
            if item.name == 'xdelta-3.1.0/xdelta3/install-sh' and item.issym():
                continue  # Upstream build-system link; unused by this direct build.
            assert item.isfile() or item.isdir()
            archive.extract(item, work, filter="data")
    flags = ['-arch', 'x86_64', '-mmacosx-version-min=11.0', '-O2',
             '-DHAVE_CONFIG_H=0', '-DSIZEOF_SIZE_T=8', '-DSIZEOF_UNSIGNED_INT=4',
             '-DSIZEOF_UNSIGNED_LONG=8', '-DSIZEOF_UNSIGNED_LONG_LONG=8',
             '-DXD3_MAIN=1', '-DSECONDARY_DJW=1', '-DSECONDARY_FGK=1', '-DHAVE_LZMA_H=1']
    binary = work / 'xdelta3'
    subprocess.run(['xcrun', 'clang', *flags, '-I' + str(source / 'include'),
                    str(work / 'xdelta-3.1.0/xdelta3/xdelta3.c'), '-llzma', '-o', str(binary)], check=True)
    subprocess.run(['codesign', '--force', '--sign', '-', '--timestamp=none', binary], check=True)
    dependencies = subprocess.check_output(['otool', '-L', binary], text=True)
    assert '/usr/lib/liblzma.5.dylib' in dependencies and '/opt/' not in dependencies
    subprocess.run([binary, '-V'], check=True)
    target = repo / 'sidecar/xdelta/xdelta3'
    target.write_bytes(binary.read_bytes())
    target.chmod(0o755)
    (repo / 'sidecar/xdelta/LICENSE.txt').write_bytes((source / 'COPYING').read_bytes())
    (source / 'build.json').write_text(json.dumps(dict(
        sha256=sha(target), architecture='x86_64', minimumMacOS='11.0',
        sourceArchiveSha256=record['sourceArchiveSha256'], flags=flags,
        compiler=subprocess.check_output(['xcrun', 'clang', '--version'], text=True).splitlines()[0],
        dependencies=dependencies.splitlines()[1:], signing='ad-hoc, not notarized'), indent=2) + '\n')
