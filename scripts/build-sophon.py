#!/usr/bin/env python3
"""Locked standalone Sophon build; no launcher/profile inputs."""
import hashlib
import os
from pathlib import Path
import shutil
import subprocess
import zipfile

root = Path(__file__).resolve().parent.parent
os.chdir(root)
archive = root / '.tmp/protoc-31.1.zip'
archive.parent.mkdir(exist_ok=True)
if not archive.exists():
    subprocess.run(['curl', '-fL', '--max-time', '180',
                    'https://github.com/protocolbuffers/protobuf/releases/download/v31.1/protoc-31.1-osx-universal_binary.zip',
                    '-o', archive], check=True)
assert hashlib.sha256(archive.read_bytes()).hexdigest() == '99ea004549c139f46da5638187a85bbe422d78939be0fa01af1aa8ab672e395f'
protoc = root / '.tmp/protoc-build/protoc'
protoc.parent.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(archive) as z:
    protoc.write_bytes(z.read('bin/protoc'))
protoc.chmod(0o755)
project = root / 'sophon_server'
subprocess.run([protoc, '--python_out=.', 'manifest.proto', 'manifest_ldiff.proto'], cwd=project, check=True)
python = 'cpython-3.13.15-macos-x86_64-none'
subprocess.run(['uv', 'sync', '--frozen', '--python', python], cwd=project, check=True)
shutil.copy2(root / 'sidecar/hpatchz/hpatchz', project / 'hpatchz')
try:
    distribution = project / 'build/server.dist'
    assert not distribution.is_symlink()
    if distribution.exists():
        shutil.rmtree(distribution)  # Only generated output; never a profile.
    subprocess.run(['uv', 'run', '--frozen', '--python', python, 'nuitka',
                    '--standalone', '--disable-ccache', '--python-flag=isolated', '--include-data-files=./hpatchz=./hpatchz',
                    '--include-package-data=certifi:cacert.pem',
                    '--output-filename=sophon-server', '--output-dir=./build',
                    '--assume-yes-for-downloads', 'server.py'], cwd=project,
                   env={**os.environ, 'NUITKA_CACHE_DIR': str(project / '.cache')}, check=True)
    assert (distribution / 'certifi/cacert.pem').is_file(), 'Standalone TLS certificate bundle is missing'
finally:
    (project / 'hpatchz').unlink()
