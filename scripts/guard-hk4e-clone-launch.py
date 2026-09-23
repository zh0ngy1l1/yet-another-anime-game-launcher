#!/usr/bin/env python3
"""Run an existing Neutralino launcher against an isolated game/profile on macOS.

This is a development safety wrapper, not a new game launch mechanism. The
launcher still owns all Wine, Steam, R2 and game lifetime operations.
"""
import argparse
import datetime
import json
import os
from pathlib import Path
import re
import subprocess
import sys

from sophon_clone_guard import guard_clone, guard_auxiliary_path, inventory, write_json_result


def redact(text):
    text = re.sub(r'(https?://[^\s?"<>]+)\?[^\s"<>]*', r'\1?[REDACTED]', text)
    text = re.sub(r'(?i)(request[= ]+)[0-9a-f]{32,}', r'\1[REDACTED]', text)
    return re.sub(r'(?i)((?:password|token|authorization|cookie|secret|session_key)[\"\']?\s*[=:]\s*).*',
                  r'\1[REDACTED]', text)


def validate(original, clone, profile, evidence, protected):
    original, clone, before, _ = guard_clone(original, clone)
    profile = profile.resolve(strict=True)
    if any(profile == p or p in profile.parents or profile in p.parents
           for p in (original, clone, *protected)):
        raise ValueError('Development profile must be disjoint from protected installations')
    selected = (profile / '.storage/game_install_dir.neustorage').read_text().strip()
    if selected.startswith('"'):
        selected = json.loads(selected)
    if Path(selected).resolve(strict=True) != clone:
        raise ValueError('Development game setting must resolve to the verified clone')
    evidence = guard_auxiliary_path(evidence, [original, clone, profile, *protected], 'Evidence')
    return original, clone, profile, evidence, before


def policy_for(original, protected):
    # Seatbelt matches canonical paths: /tmp must become /private/tmp.
    rules = ['(version 1)', '(allow default)',
             '(deny file-read* file-write* (subpath ' + json.dumps(str(original.resolve())) + '))']
    rules += ['(deny file-write* (subpath ' + json.dumps(str(p.resolve())) + '))'
              for p in protected]
    return '\n'.join(rules)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ('original', 'clone', 'profile', 'evidence', 'executable'):
        parser.add_argument('--' + name, type=Path, required=True)
    parser.add_argument('--protect', type=Path, action='append', default=[])
    args = parser.parse_args()
    if sys.platform != 'darwin':
        parser.error('This wrapper requires macOS Seatbelt')
    protected = [p.resolve(strict=True) for p in args.protect]
    try:
        original, clone, profile, evidence, before = validate(
            args.original, args.clone, args.profile, args.evidence, protected)
    except ValueError as error:
        parser.error(str(error))
    evidence.mkdir(mode=0o700, parents=True, exist_ok=True)
    policy = evidence / 'launch.sb'
    if policy.exists():
        parser.error('Refusing to overwrite launch evidence; use a fresh evidence directory')
    policy.write_text(policy_for(original, protected))
    command = ['/usr/bin/sandbox-exec', '-f', str(policy),
               str(args.executable.resolve(strict=True)), '--load-dir-res', '--path=' + str(profile)]
    started = datetime.datetime.now(datetime.timezone.utc).isoformat()
    record = dict(started_utc=started, command=command, cwd=str(profile), clone=str(clone),
                  original=str(original), sandbox_policy=str(policy), protected=list(map(str, protected)))
    with (evidence / 'launcher-console.sanitized.log').open('x') as log:
        child = subprocess.Popen(command, cwd=profile, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                 text=True, errors='replace', env={**os.environ, 'PATH_LAUNCH': str(profile)})
        record['pid'] = child.pid
        write_json_result(evidence / 'launch-process.json', record)
        print(json.dumps({'launcher_pid': child.pid, 'profile': str(profile)}), flush=True)
        for line in child.stdout:
            log.write(redact(line))
            log.flush()
        code = child.wait()
    record.update(exit_code=code, ended_utc=datetime.datetime.now(datetime.timezone.utc).isoformat(),
                  original_inventory_unchanged=inventory(original) == before)
    write_json_result(evidence / 'launch-process.json', record)
    print(json.dumps(record), flush=True)
    return code if record['original_inventory_unchanged'] else 2


if __name__ == '__main__':
    raise SystemExit(main())
