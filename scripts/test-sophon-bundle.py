#!/usr/bin/env python3
"""Smoke-test a standalone Sophon binary using an isolated temporary cwd.

Only health and public online metadata are requested. This never submits an
install/update/repair task, opens a launcher profile, or uses a game directory.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import socket
import subprocess
import tempfile
import time
from urllib import error, request


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('executable', type=Path)
    parser.add_argument('--websocket', action='store_true', help='Also check WebSocket transport (requires the locked Sophon Python environment)')
    args = parser.parse_args()
    executable = args.executable.resolve(strict=True)
    certificate_bundle = executable.parent / 'certifi/cacert.pem'
    if not certificate_bundle.is_file():
        raise RuntimeError('Standalone certificate bundle is missing')
    with socket.socket() as socket_probe:
        socket_probe.bind(('127.0.0.1', 0))
        port = socket_probe.getsockname()[1]
    with tempfile.TemporaryDirectory(prefix='yaagl-sophon-bundle-smoke-') as directory:
        cwd = Path(directory).resolve()
        env = dict(os.environ, SOPHON_HOST='127.0.0.1', SOPHON_PORT=str(port))
        env.pop('TERMINATE_WITH_PID', None)
        with (cwd / 'server.log').open('wb') as log:
            process = subprocess.Popen([str(executable)], cwd=cwd, env=env, stdout=log, stderr=subprocess.STDOUT)
            try:
                base = f'http://127.0.0.1:{port}'
                health = None
                deadline = time.monotonic() + 45
                while time.monotonic() < deadline:
                    if process.poll() is not None:
                        raise RuntimeError(f'Standalone server exited with status {process.returncode}')
                    try:
                        with request.urlopen(base + '/health', timeout=1) as response:
                            health = json.load(response)
                        break
                    except (OSError, error.URLError):
                        time.sleep(0.1)
                if not health or health.get('status') != 'healthy':
                    raise RuntimeError('Standalone health check did not succeed')
                if args.websocket:
                    from websockets.sync.client import connect
                    # Unknown task lookup is read-only and must return an
                    # explicit error through the compiled WebSocket backend.
                    with connect(f'ws://127.0.0.1:{port}/ws/smoke-unknown-task', open_timeout=10) as websocket:
                        event = json.loads(websocket.recv(timeout=10))
                    if event.get('type') != 'error' or event.get('task_id') != 'smoke-unknown-task':
                        raise RuntimeError('Standalone WebSocket transport did not return the task error')
                with request.urlopen(base + '/api/game/online_info?game=hk4e&reltype=os', timeout=150) as response:
                    info = json.load(response)
                if info.get('error') or not info.get('version') or info.get('full_manifest_update') is not True:
                    raise RuntimeError('Standalone online metadata request failed or lacks full-manifest capability')
                with executable.open('rb') as binary, certificate_bundle.open('rb') as certificates:
                    result = dict(health=health['status'], version=info['version'],
                                  install_size=info['install_size'], full_manifest_update=info['full_manifest_update'],
                                  pre_download=info['pre_download'],
                                  executable_sha256=hashlib.file_digest(binary, 'sha256').hexdigest(),
                                  certificate_bundle_sha256=hashlib.file_digest(certificates, 'sha256').hexdigest(),
                                  websocket_checked=args.websocket,
                                  cwd_isolated=True, game_operations_submitted=0)
            finally:
                process.terminate()
                try:
                    process.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait(timeout=5)
        result['server_stopped'] = process.poll() is not None
        print(json.dumps(result, indent=2))


if __name__ == '__main__':
    main()
