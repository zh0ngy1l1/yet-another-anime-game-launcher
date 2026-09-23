#!/usr/bin/env python3
"""Run compiled REST reliable repair on an already independently verified clone.

Requires disjoint canonical directories and zero shared inodes anywhere in
original/clone inventories. Never accepts the original as the repair target.
Uses the locked Sophon Python environment for the WebSocket client.
"""
import argparse
from collections import Counter
import configparser
import hashlib
import json
import os
from pathlib import Path
import socket
import subprocess
import tempfile
import time
from urllib import error, request

from sophon_clone_guard import guard_clone, inventory, write_json_result


def version(root):
    config = configparser.ConfigParser()
    with (root / 'config.ini').open() as stream:
        config.read_file(stream)
    return config['General']['game_version']


def json_request(base, route, body=None):
    payload = None if body is None else json.dumps(body).encode()
    req = request.Request(base + route, data=payload,
                          headers={'Content-Type': 'application/json'} if payload else {})
    with request.urlopen(req, timeout=15) as response:
        return json.load(response)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--executable', type=Path, required=True)
    parser.add_argument('--expected-binary-sha256', required=True)
    parser.add_argument('--original', type=Path, required=True)
    parser.add_argument('--clone', type=Path, required=True)
    parser.add_argument('--expected-version', required=True)
    parser.add_argument('--cache', type=Path, required=True)
    parser.add_argument('--result', type=Path, required=True)
    parser.add_argument('--timeout', type=int, default=1800)
    args = parser.parse_args()
    executable = args.executable.resolve(strict=True)
    with executable.open('rb') as stream:
        binary_hash = hashlib.file_digest(stream, 'sha256').hexdigest()
    if binary_hash != args.expected_binary_sha256:
        parser.error('Compiled artifact does not match the validated build')
    original, clone, original_entries, clone_entries = guard_clone(args.original, args.clone)
    if version(clone) != args.expected_version:
        parser.error('Clone is not already committed to the independently verified target version')
    cache = args.cache.resolve()
    manifest_cache = (cache / 'full-manifests').resolve()
    result_path = args.result.resolve()
    if any(path == original or original in path.parents for path in (cache, manifest_cache)):
        parser.error('Manifest cache must not be inside the original installation')
    if any(result_path == root or root in result_path.parents for root in (original, clone)):
        parser.error('Result must be outside both game directories')
    from websockets.sync.client import connect

    result = dict(executable_sha256=binary_hash, expected_version=args.expected_version,
                  original_entries=len(original_entries), clone_entries=len(clone_entries),
                  shared_inodes=0, websocket_completed=False, terminal_status=None,
                  max_downloaded_chunk_bytes=0, max_reused_bytes=0,
                  total_files=0, stages={}, server_stopped=False)
    stages = Counter()
    started = time.monotonic()
    failure = None
    with socket.socket() as probe:
        probe.bind(('127.0.0.1', 0))
        port = probe.getsockname()[1]
    with tempfile.TemporaryDirectory(prefix='yaagl-sophon-clone-rest-') as directory:
        cwd = Path(directory).resolve()
        env = dict(os.environ, SOPHON_HOST='127.0.0.1', SOPHON_PORT=str(port))
        env.pop('TERMINATE_WITH_PID', None)
        with (cwd / 'server.log').open('wb') as log:
            process = subprocess.Popen([str(executable)], cwd=cwd, env=env, stdout=log, stderr=subprocess.STDOUT)
            try:
                base = f'http://127.0.0.1:{port}'
                deadline = time.monotonic() + 45
                while True:
                    if process.poll() is not None or time.monotonic() > deadline:
                        raise RuntimeError('Compiled server did not become healthy')
                    try:
                        health = json_request(base, '/health')
                        if health.get('status') == 'healthy':
                            break
                    except (OSError, error.URLError):
                        pass
                    time.sleep(0.1)
                acknowledgement = json_request(base, '/api/repair', dict(
                    gamedir=str(clone), tempdir=str(cache), game_type='hk4e', repair_mode='reliable'))
                task_id = acknowledgement['task_id']
                if acknowledgement.get('status') not in ('pending', 'running'):
                    raise RuntimeError('Repair task did not start')
                result['task_id'] = task_id
                last_report = 0
                deadline = time.monotonic() + args.timeout
                final_stage = None
                with connect(f'ws://127.0.0.1:{port}/ws/{task_id}', open_timeout=15) as websocket:
                    while time.monotonic() < deadline:
                        try:
                            event = json.loads(websocket.recv(timeout=5))
                        except TimeoutError:
                            event = {}
                        if event and event.get('task_id') != task_id:
                            raise RuntimeError('WebSocket returned a different task identity')
                        if event.get('type') == 'update_stage':
                            stage = event['stage']
                            stages[stage] += 1
                            final_stage = stage
                            result['max_downloaded_chunk_bytes'] = max(result['max_downloaded_chunk_bytes'], event.get('downloaded_bytes', 0))
                            result['max_reused_bytes'] = max(result['max_reused_bytes'], event.get('reused_bytes', 0))
                            result['total_files'] = max(result['total_files'], event.get('total_files', 0))
                        if event.get('type') in ('error', 'job_error'):
                            raise RuntimeError(event.get('error', 'Repair failed'))
                        if event.get('type') == 'completed':
                            result['websocket_completed'] = True
                            break
                        if time.monotonic() - last_report > 15:
                            status = json_request(base, f'/api/tasks/{task_id}/status')
                            result['terminal_status'] = status.get('status')
                            if status.get('status') in ('failed', 'cancelled'):
                                raise RuntimeError(status.get('error') or 'Repair failed')
                            print(json.dumps(dict(stage=final_stage, status=status['status'],
                                                  downloaded_chunk_bytes=result['max_downloaded_chunk_bytes'],
                                                  elapsed_seconds=round(time.monotonic() - started, 1))), flush=True)
                            last_report = time.monotonic()
                status = json_request(base, f'/api/tasks/{task_id}/status')
                result['terminal_status'] = status.get('status')
                result['final_stage'] = final_stage
                if not result['websocket_completed'] or final_stage != 'complete' or status.get('status') != 'completed':
                    raise RuntimeError('Repair completion was not confirmed by both transports')
                if result['max_downloaded_chunk_bytes']:
                    raise RuntimeError('Already verified clone unexpectedly required game chunk downloads')
                if version(clone) != args.expected_version:
                    raise RuntimeError('Repair changed the clone to an unexpected target version')
                result['game_version'] = version(clone)
            except Exception as exc:
                failure = str(exc)
            finally:
                process.terminate()
                try:
                    process.wait(timeout=15)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait(timeout=5)
                result['server_stopped'] = process.poll() is not None
    after = inventory(original)
    result['original_inventory_unchanged'] = after == original_entries
    if after != original_entries:
        failure = 'Original installation inventory changed during clone repair'
    result['stages'] = dict(stages)
    result['elapsed_seconds'] = time.monotonic() - started
    result['error'] = failure
    result_path.parent.mkdir(parents=True, exist_ok=True)
    write_json_result(result_path, result)
    print(json.dumps(result, indent=2), flush=True)
    return 1 if failure else 0


if __name__ == '__main__':
    raise SystemExit(main())
