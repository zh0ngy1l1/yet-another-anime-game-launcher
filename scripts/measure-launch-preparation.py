#!/usr/bin/env python3
"""Measure the production filesystem preparation recipe; never executes Wine.

Full runtime input is read only; all recipe outputs, prefix and non-executable
placeholder live in one owned disposable directory. This is not total launch
latency and does not provide a product admission bypass.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import platform
import re
import resource
import shutil
import subprocess
import tempfile
import threading
import time


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--runtime', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    parser.add_argument('--runs', type=int, default=3)
    parser.add_argument('--no-game-mode', action='store_true')
    parser.add_argument('--no-fullscreen', action='store_true')
    parser.add_argument('--no-fps', action='store_true')
    args = parser.parse_args()
    if args.runs < 1 or (not args.no_game_mode and args.no_fullscreen):
        parser.error('positive run count and fullscreen for Game Mode required')
    repo = Path(__file__).resolve().parent.parent
    runtime = args.runtime.resolve(strict=True)
    output = args.output.resolve()
    if output == runtime or output.is_relative_to(runtime) or runtime.is_relative_to(output):
        parser.error('output and input runtime must be disjoint trees')
    output.mkdir(parents=True, exist_ok=True)
    result_path = output / 'runtime-measurements.json'
    if result_path.exists():
        parser.error('output already contains runtime-measurements.json')
    sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
    recipe = repo / 'src/clients/mhy/hk4e/prepare-r2.pl'
    base = json.loads((repo / 'native/wine-r2/delta.json').read_text())
    report = {
        'schema': 1, 'boundary': 'production prepare-r2.pl only; no Wine process or game',
        'runtimeInput': str(runtime), 'recipeSha256': sha(recipe),
        'sourceCommit': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=repo, text=True).strip(),
        'os': platform.platform(), 'machine': platform.machine(),
        'settings': {'fps': not args.no_fps, 'fullscreen': not args.no_fullscreen,
                     'gameMode': not args.no_game_mode, 'region': 'Global'},
        'cache': 'existing complete local inputs, fresh output every run; no network, no OS cache flush; source clone creation excluded',
        'runs': [],
    }
    # TemporaryDirectory removes only this harness's own tree on every exit.
    with tempfile.TemporaryDirectory(prefix='yaagl-preparation-measure-') as tmp:
        root = Path(tmp).resolve()
        source = root / 'source'
        subprocess.run(['/bin/cp', '-cR', str(runtime), str(source)], check=True)
        prefix = root / 'prefix'
        prefix.mkdir()
        game = root / 'GenshinImpact.exe'
        game.write_bytes(b'Non-executable measurement identity; never passed to Wine.\n')
        manifest = {**base, 'applyR2': not args.no_fps}
        if not args.no_fullscreen:
            manifest.update(fullscreen=json.loads((repo / 'native/wine-fullscreen/manifest.json').read_text()),
                            fullscreenAssets=str(repo / 'sidecar/wine-fullscreen'))
        if not args.no_game_mode:
            manifest.update(gameMode=json.loads((repo / 'native/wine-game-mode/manifest.json').read_text()),
                            gameModeAssets=str(repo / 'sidecar/wine-game-mode'),
                            gameModeExecutable=str(game), gameModePrefix=str(prefix))
        report['inputNtdllSha256'] = sha(source / 'lib/wine/x86_64-unix/ntdll.so')
        report['manifestSha256'] = hashlib.sha256(json.dumps(manifest, sort_keys=True).encode()).hexdigest()
        for index in range(1, args.runs + 1):
            request = f'fixture-{os.getpid()}-{index}'
            parent = root / f'run-{index}'
            before = resource.getrusage(resource.RUSAGE_CHILDREN)
            with (output / f'runtime-{index}.stdout').open('w') as stdout, (output / f'runtime-{index}.stderr').open('w') as stderr:
                start = time.monotonic()
                proc = subprocess.Popen(['/usr/bin/time', '-l', '/usr/bin/perl', str(recipe),
                    str(source), str(parent), json.dumps({**manifest, 'timingRequest': request})],
                    stdout=stdout, stderr=stderr)
                samples = []
                stop = threading.Event()
                def sample():
                    while not stop.is_set():
                        data = subprocess.check_output(['/bin/ps', '-axo', 'pid=,ppid=,%cpu=,rss=,state=,comm='], text=True)
                        rows = [line.split(None, 5) for line in data.splitlines()]
                        owned = {proc.pid}
                        while True:
                            children = {int(row[0]) for row in rows if int(row[1]) in owned}
                            if children <= owned:
                                break
                            owned |= children
                        samples.append({'atSeconds': time.monotonic() - start,
                                        'processes': [row for row in rows if int(row[0]) in owned]})
                        stop.wait(1)
                sampler = threading.Thread(target=sample, daemon=True)
                sampler.start()
                try:
                    code = proc.wait()
                except BaseException:
                    # Recipe children are finite cp/codesign only. Retain ownership
                    # until they settle before TemporaryDirectory removes outputs.
                    proc.wait()
                    raise
                finally:
                    elapsed = time.monotonic() - start
                    stop.set()
                    sampler.join()
            after = resource.getrusage(resource.RUSAGE_CHILDREN)
            (output / f'runtime-{index}.processes.json').write_text(json.dumps(samples, indent=2) + '\n')
            raw = (output / f'runtime-{index}.stderr').read_text()
            spans = [json.loads(line[len('HK4E_RUNTIME_TIMING '):]) for line in raw.splitlines()
                     if line.startswith('HK4E_RUNTIME_TIMING ')]
            record = {'run': index, 'request': request, 'wallSeconds': elapsed, 'exitCode': code,
                'userSeconds': after.ru_utime - before.ru_utime,
                'systemSeconds': after.ru_stime - before.ru_stime,
                'cpuScope': 'RUSAGE_CHILDREN includes the process sampler; recipe-only CPU is in recipeUsage',
                'spans': spans}
            usage = re.search(r'([\d.]+) real\s+([\d.]+) user\s+([\d.]+) sys', raw)
            if usage:
                record['recipeUsage'] = dict(zip(['wallSeconds', 'userSeconds', 'systemSeconds'], map(float, usage.groups())))
            record['resourceCounters'] = {label: int(value) for value, label in re.findall(
                r'^\s+(\d+)\s+(maximum resident set size|page faults|block input operations|block output operations|voluntary context switches|involuntary context switches)$', raw, re.M)}
            report['runs'].append(record)
            result_path.write_text(json.dumps(report, indent=2) + '\n')
            if code:
                raise RuntimeError(f'production recipe failed; see {output / f"runtime-{index}.stderr"}')
            prepared = Path((output / f'runtime-{index}.stdout').read_text().strip())
            if not prepared.is_relative_to(parent) or prepared.name != 'wine':
                raise RuntimeError('unrecognized production result')
            receipt = json.loads((prepared.parent / 'receipt.json').read_text())
            files = [entry for entry in receipt['files'].values() if entry[0] == 'file']
            record.update(outputFiles=len(files), outputLogicalBytes=sum(entry[2] for entry in files))
            shutil.rmtree(parent)
            print(f'Run {index}: {elapsed:.3f}s; CPU {record["userSeconds"]:.3f}s user / {record["systemSeconds"]:.3f}s system', flush=True)
        report['temporaryStateRemoved'] = True
    result_path.write_text(json.dumps(report, indent=2) + '\n')
    print(result_path)


if __name__ == '__main__':
    main()
