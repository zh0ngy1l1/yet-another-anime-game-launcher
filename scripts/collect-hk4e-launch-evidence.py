#!/usr/bin/env python3
"""Copy HK4E launch evidence without starting Wine or writing to source paths."""
import argparse
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import tempfile

REQUEST = re.compile(r"/tmp/yaagl-(?:fps|owned-wine)\.[A-Za-z0-9]{6,64}(?![A-Za-z0-9_.-])")
SETTINGS = (
    "game_install_dir", "wine_tag", "wine_state", "installed_dxmt_version",
    "config_hk4e_fps_unlock_enabled", "config_hk4e_fps_unlock_target",
    "config_steam_patch", "config_block_net", "config_timeout_fix", "config_metalHud",
)


def request_paths(text):
    return sorted({p for p in REQUEST.findall(text) if set(p.rsplit('.', 1)[1]) != {'X'}})


def digest(path):
    h = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


class Capture:
    def __init__(self, output):
        self.output = output
        self.entries = {}

    def copy(self, source):
        source = Path(os.path.abspath(source))
        key = str(source)
        if key in self.entries:
            return
        entry = self.entries[key] = {'source': key}
        try:
            info = source.lstat()
            entry.update(bytes=info.st_size, mtimeNs=info.st_mtime_ns,
                         mode=oct(stat.S_IMODE(info.st_mode)))
            if stat.S_ISLNK(info.st_mode):
                entry.update(kind='symlink', target=os.readlink(source), copied=False)
                return
            if not stat.S_ISREG(info.st_mode):
                entry.update(kind='non-regular', copied=False)
                return
            target = self.output / 'files' / source.relative_to('/')
            target.parent.mkdir(parents=True, exist_ok=True)
            # Never read a substituted symlink or write to an existing evidence file.
            fd = os.open(source, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
            h = hashlib.sha256()
            with os.fdopen(fd, 'rb') as src, target.open('xb') as dst:
                before = os.fstat(src.fileno())
                if not stat.S_ISREG(before.st_mode):
                    raise ValueError('Source changed to non-regular file')
                remaining = before.st_size
                while remaining:
                    chunk = src.read(min(1024 * 1024, remaining))
                    if not chunk:
                        break
                    dst.write(chunk)
                    h.update(chunk)
                    remaining -= len(chunk)
                after = os.fstat(src.fileno())
            current = source.lstat()
            identity = lambda s: (s.st_dev, s.st_ino, s.st_size, s.st_mtime_ns, s.st_ctime_ns)
            entry.update(kind='file', copied=True, copy=str(target.relative_to(self.output)),
                         capturedBytes=before.st_size - remaining, sha256=h.hexdigest(),
                         stable=(remaining == 0 and identity(info) == identity(before)
                                 == identity(after) == identity(current)))
            os.chmod(target, 0o600)
        except (OSError, ValueError) as error:
            entry['error'] = str(error)

    def tree(self, root):
        root = Path(root)
        if root.is_symlink() or not root.is_dir():
            self.copy(root)
            return
        self.entries[str(root)] = {'source': str(root), 'kind': 'directory'}
        for directory, dirs, files in os.walk(root, followlinks=False):
            for name in files + [d for d in dirs if (Path(directory) / d).is_symlink()]:
                self.copy(Path(directory) / name)


def collect(profile, output, consoles=()):
    profile = profile.resolve()
    output = output.resolve()
    if output == profile or profile in output.parents:
        raise ValueError('Evidence output must be outside the profile')
    output.mkdir(mode=0o700, parents=True, exist_ok=False)
    capture = Capture(output)
    launcher = profile / 'neutralinojs.log'
    capture.copy(launcher)
    launcher_copy = capture.entries[str(launcher)].get('copy')
    text = (output / launcher_copy).read_text(errors='replace') if launcher_copy else ''
    references = request_paths(text)
    for reference in references:
        capture.tree(Path(reference))
    game_logs = sorted((profile / 'logs').glob('game_*.log*'))
    for path in game_logs:
        capture.copy(path)
    # Millisecond epoch in the launcher filename anchors crash-report correlation.
    epochs = [int(m.group(1)) / 1000 for p in game_logs
              if (m := re.fullmatch(r'game_(\d+)\.log', p.name))]
    anchor = max(epochs) if epochs else datetime.datetime.now().timestamp()
    window = (anchor - 3600, anchor + 3600)
    for name in SETTINGS:
        capture.copy(profile / '.storage' / (name + '.neustorage'))
    game_setting = profile / '.storage/game_install_dir.neustorage'
    setting_entry = capture.entries[str(game_setting)]
    if setting_entry.get('copied'):
        value = (output / setting_entry['copy']).read_text().strip()
        if value.startswith('"'):
            value = json.loads(value)
        if isinstance(value, str) and value.startswith('/'):
            game = Path(value)
            for name in ('driverError.log', 'config.ini'):
                capture.copy(game / name)
    users = profile / 'wineprefix/drive_c/users'
    for vendor in ('miHoYo/Genshin Impact', 'miHoYo/原神'):
        for folder in users.glob('*/AppData/LocalLow/' + vendor):
            for path in folder.rglob('*'):
                if path.suffix.lower() in ('.log', '.dmp', '.mdmp') or path.name in ('output_log.txt', 'error.txt'):
                    capture.copy(path)
    for temp in ('*/Temp', '*/AppData/Local/Temp'):
        for folder in users.glob(temp):
            for crash in folder.glob('mihoyocrash_*'):
                capture.tree(crash)
    for reports in (Path.home() / 'Library/Logs/DiagnosticReports', Path('/Library/Logs/DiagnosticReports')):
        for path in reports.rglob('*'):
            if path.is_file() and re.match(r'(?i)(yaagl|wine|genshin|yuanshen|fps-bridge)', path.name):
                if window[0] <= path.stat().st_mtime <= window[1]:
                    capture.copy(path)
    for console in consoles:
        capture.tree(console)
    for pattern in ('yaagl-fps-console.*', 'yaagl-enabled60-console.*'):
        for console in Path('/tmp').glob(pattern):
            log = console / 'terminal.log'
            if log.is_file() and window[0] <= log.stat().st_mtime <= window[1]:
                capture.copy(log)
    repo = Path(__file__).resolve().parents[1]
    identities = []
    for path in (profile / 'sidecar/fps-bridge/fps-bridge.exe',
                 profile / 'sidecar/protonextras/steam64.exe',
                 profile / 'sidecar/protonextras/lsteamclient64.dll',
                 profile / 'wine/lib/wine/x86_64-unix/ntdll.so',
                 repo / 'bin/hk4e-neutralino-arm64'):
        record = {'path': str(path), 'resolved': str(path.resolve())}
        try:
            record.update(bytes=path.stat().st_size, sha256=digest(path))
        except OSError as error:
            record['error'] = str(error)
        identities.append(record)
    git = {}
    for name, args in (('head', ['rev-parse', 'HEAD']), ('status', ['status', '--porcelain=v1'])):
        result = subprocess.run(['git', '-C', str(repo), *args], capture_output=True, text=True)
        git[name] = {'exitCode': result.returncode, 'stdout': result.stdout, 'stderr': result.stderr}
    manifest = dict(createdUTC=datetime.datetime.now(datetime.timezone.utc).isoformat(),
                    profile=str(profile), git=git, identities=identities,
                    requestPaths=references, crashWindowEpoch=window,
                    files=list(capture.entries.values()),
                    notes=['Source files were only read; no Wine/process/protocol/cleanup actions.',
                           'Missing or unstable entries are explicit; a live collection is not an atomic snapshot.',
                           'No automatic conclusion about cleanup or game success. Logs can contain private data.'])
    (output / 'manifest.json').write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + '\n')
    return output


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--profile', type=Path, default=Path(__file__).resolve().parents[1] / 'yaaglwdos')
    parser.add_argument('--output', type=Path, help='New directory outside the profile; never overwritten')
    parser.add_argument('--console', type=Path, action='append', default=[], help='Exact console capture directory/file; repeatable')
    args = parser.parse_args()
    os.umask(0o077)
    if args.output is None:
        base = Path.home() / 'Library/Application Support/YAAGL Local Builds'
        base.mkdir(parents=True, exist_ok=True)
        # Reserve a unique parent, leaving the actual output nonexistent.
        parent = Path(tempfile.mkdtemp(prefix='manual-evidence-' + datetime.datetime.now().strftime('%Y%m%dT%H%M%S') + '-', dir=base))
        args.output = parent / 'capture'
    print(collect(args.profile, args.output, args.console))


if __name__ == '__main__':
    main()
