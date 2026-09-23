#!/usr/bin/env python3
"""Explicit CLI for the same updater used by YAAGL's REST service.

--verify-only performs no game writes. --clone-of additionally enforces
independent regular files before permitting a development update.
"""
import argparse
import json
from pathlib import Path
import signal
import sys
import threading
import time

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / 'sophon_server'))
from sophon_full import prepare_update


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--gamedir', type=Path, required=True)
    parser.add_argument('--cache', type=Path, required=True)
    parser.add_argument('--clone-of', type=Path)
    parser.add_argument('--verify-only', action='store_true')
    parser.add_argument('--predownload', action='store_true')
    parser.add_argument('--result', type=Path)
    args = parser.parse_args()
    root = args.gamedir.resolve(strict=True)
    if args.clone_of:
        original = args.clone_of.resolve(strict=True)
        if root == original or original in root.parents or root in original.parents:
            parser.error('Clone and original must be disjoint canonical directories')
        for path in root.rglob('*'):
            if path.is_symlink():
                parser.error('Clone contains a symlink')
            if path.is_file():
                counterpart = original / path.relative_to(root)
                if counterpart.exists() and path.samefile(counterpart):
                    parser.error('Clone shares a file inode with the original')
    if not args.verify_only and not args.clone_of:
        parser.error('Development CLI writes require --clone-of; normal installs use YAAGL')
    cancel = threading.Event()
    signal.signal(signal.SIGINT, lambda *_: cancel.set())
    signal.signal(signal.SIGTERM, lambda *_: cancel.set())
    last = 0
    def event(value):
        nonlocal last
        now = time.monotonic()
        if now - last > 5 or value.get('stage') in ('manifests', 'finalizing', 'complete'):
            last = now
            print(json.dumps(value), flush=True)
    updater = prepare_update(root, args.cache, predownload=args.predownload, cancel=cancel, event=event)
    print(json.dumps(dict(target=updater.target.version, source=updater.source.version if updater.source else None,
                          categories=updater.target.categories, files=len(updater.targets), obsolete=len(updater.obsolete))), flush=True)
    started = time.monotonic()
    if args.verify_only:
        failed = updater.verify()
        result = dict(version=updater.target.version, verified_files=len(updater.targets), failed=failed,
                      categories=updater.target.categories, elapsed_seconds=time.monotonic() - started)
    else:
        result = updater.run(predownload=args.predownload)
        result['elapsed_seconds'] = time.monotonic() - started
    if args.result:
        args.result.write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(result), flush=True)
    return 1 if result.get('failed') else 0


if __name__ == '__main__':
    raise SystemExit(main())
