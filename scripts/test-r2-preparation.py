#!/usr/bin/env python3
"""Harmless filesystem preparation regressions; never executes Wine/game."""
import argparse
import copy
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import tempfile

p = argparse.ArgumentParser()
p.add_argument('--runtime', type=Path, required=True, help='Read-only supported Wine root')
p.add_argument('--output', type=Path, required=True)
a = p.parse_args()
repo = Path(__file__).resolve().parent.parent
manifest = json.loads((repo / 'native/wine-r2/delta.json').read_text())
relative = 'lib/wine/x86_64-unix/ntdll.so'
sha = lambda f: hashlib.sha256(f.read_bytes()).hexdigest()
results = []
with tempfile.TemporaryDirectory(prefix='yaagl-r2-tests-') as tmp:
    root = Path(tmp).resolve()
    source = root / 'source'
    for name in [relative, *manifest['pins']]:
        dest = source / name
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(a.runtime / name, dest)
    ntdll = source / relative
    original = bytearray(ntdll.read_bytes())
    if sha(ntdll) == manifest['outputSha256']:
        for offset, old, new in manifest['changes']:
            assert original[offset] == new
            original[offset] = old
    assert hashlib.sha256(original).hexdigest() == manifest['inputSha256']
    ntdll.write_bytes(original)
    parent = root / 'prepared'
    def invoke(name, ok, data=manifest):
        before = set(parent.iterdir()) if parent.exists() else set()
        run = subprocess.run(['/usr/bin/perl', str(repo / 'src/clients/mhy/hk4e/prepare-r2.pl'),
                              str(source), str(parent), json.dumps(data)], capture_output=True, text=True)
        assert (run.returncode == 0) == ok, (name, run.stderr)
        if ok:
            runtime = Path(run.stdout.strip())
            assert sha(runtime / relative) == manifest['outputSha256']
            assert (runtime.parent / 'receipt.json').is_file()
            assert (runtime / relative).stat().st_ino != ntdll.stat().st_ino
        else:
            assert set(parent.iterdir()) == before, name
        results.append({'case': name, 'passed': True, 'exitCode': run.returncode})
        return Path(run.stdout.strip()) if ok else None
    first = invoke('fresh-original-to-exact-signed-R2', True)
    assert sha(ntdll) == manifest['inputSha256']
    ntdll.write_bytes((first / relative).read_bytes())
    second = invoke('existing-R2-copy-no-double-patch', True)
    assert first != second
    ntdll.write_bytes(original)
    bad = bytearray(original); bad[30] ^= 1; ntdll.write_bytes(bad)
    invoke('unexpected-ntdll-no-publication', False)
    ntdll.write_bytes(original)
    loader = source / 'bin/wine'
    valid = loader.read_bytes(); loader.write_bytes(b'wrong loader')
    invoke('unexpected-loader-rejected', False)
    loader.write_bytes(valid)
    (source / 'bin/wine64').write_bytes(valid)
    invoke('unexpected-alternate-loader-rejected', False)
    (source / 'bin/wine64').unlink()
    (source / 'outside').symlink_to('/etc/hosts')
    invoke('external-symlink-rejected', False)
    (source / 'outside').unlink()
    ntdll.unlink(); ntdll.symlink_to(first / relative)
    invoke('symlink-ntdll-rejected', False)
    ntdll.unlink(); ntdll.write_bytes(original); ntdll.chmod(0o755)
    bad_manifest = copy.deepcopy(manifest); bad_manifest['changes'][0][1] ^= 1
    invoke('delta-preimage-failure-removes-only-staging', False, bad_manifest)
    bad_manifest = copy.deepcopy(manifest); bad_manifest['outputSha256'] = '0' * 64
    invoke('delta-output-failure-removes-only-staging', False, bad_manifest)
    interrupted = parent / 'r2-interrupted'
    interrupted.mkdir(); (interrupted / 'partial').write_text('retained')
    third = invoke('abandoned-preparation-is-never-reused', True)
    assert (interrupted / 'partial').read_text() == 'retained' and third.parent != interrupted
    assert sha(ntdll) == manifest['inputSha256']
a.output.write_text(json.dumps(results, indent=2) + '\n')
print(f'{len(results)} R2 preparation regressions passed; no Wine execution')
