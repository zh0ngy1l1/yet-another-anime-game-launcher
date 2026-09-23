"""Verified, restartable full-manifest Sophon updates.

Protocol behavior was researched using Hi3Helper.Sophon (MIT); this is an
independent Python implementation. See docs/sophon-protocol-references.md.
No source bytes are trusted without hashing. Publication starts only after
all replacement files are staged; version metadata is the final commit.
"""
from __future__ import annotations

from contextlib import contextmanager
from collections import deque
from dataclasses import dataclass
import concurrent.futures
import fcntl
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import stat
import threading
import unicodedata
from typing import Callable
import uuid

import xxhash
import zstandard

BLOCK = 1024 * 1024
STATE_DIR = '.sophon-update'
MD5 = re.compile(r'^[0-9a-fA-F]{32}$')


class Cancelled(RuntimeError):
    pass


def check_cancel(cancel=None):
    if cancel is not None and cancel.is_set():
        raise Cancelled('Update cancelled; verified work is retained for restart')


def relative_name(name: str) -> str:
    # Reject Windows paths too, including drive-relative paths and ADS.
    if not isinstance(name, str) or not name or '\\' in name or ':' in name or '\0' in name:
        raise ValueError('Invalid manifest path')
    parts = name.split('/')
    if any(p in ('', '.', '..') for p in parts) or PurePosixPath(name).is_absolute():
        raise ValueError('Invalid manifest path')
    if parts[0].casefold() in (STATE_DIR, '.tmp') or name.casefold() == 'config.ini':
        raise ValueError('Manifest path conflicts with updater state')
    return name


def safe_path(root: Path, name: str) -> Path:
    relative_name(name)
    path = root
    for part in name.split('/'):
        path = path / part
        if path.is_symlink():
            raise ValueError('Symlink in manifest path: ' + name)
    return path


def hash_file(path: Path, cancel=None) -> str:
    digest = hashlib.md5()
    with path.open('rb') as stream:
        while data := stream.read(BLOCK):
            check_cancel(cancel)
            digest.update(data)
    return digest.hexdigest()


def matches(path: Path, size: int, md5: str, cancel=None) -> bool:
    if path.is_symlink():
        raise ValueError('Refusing symlink: ' + str(path))
    return path.is_file() and path.stat().st_size == size and hash_file(path, cancel) == md5.lower()


def sync_dir(path: Path):
    fd = os.open(path, os.O_RDONLY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def atomic_json(path: Path, value):
    part = path.with_name(path.name + '.part-' + uuid.uuid4().hex)
    try:
        with part.open('x', encoding='utf-8') as out:
            json.dump(value, out, sort_keys=True)
            out.flush()
            os.fsync(out.fileno())
        os.replace(part, path)
        sync_dir(path.parent)
    finally:
        part.unlink(missing_ok=True)


@dataclass(frozen=True)
class Chunk:
    id: str
    md5: str
    offset: int
    size: int
    compressed_size: int
    url: str = ''
    compressed: bool = True
    compressed_md5: str = ''

    @property
    def identity(self):
        return (self.md5.lower(), self.size)


@dataclass(frozen=True)
class Asset:
    name: str
    size: int
    md5: str
    chunks: tuple[Chunk, ...] = ()
    directory: bool = False


@dataclass(frozen=True)
class Build:
    version: str
    assets: tuple[Asset, ...]
    categories: tuple[str, ...] = ('game',)

    def indexed(self):
        result = {}
        folded = {}
        for asset in self.assets:
            relative_name(asset.name)
            key = unicodedata.normalize('NFC', asset.name).casefold()
            if key in folded and folded[key] != asset.name:
                raise ValueError('Case/Unicode-colliding manifest paths')
            folded[key] = asset.name
            if asset.name in result:
                if asset != result[asset.name]:
                    raise ValueError('Conflicting package assets: ' + asset.name)
                continue
            if asset.size < 0 or (not asset.directory and not MD5.fullmatch(asset.md5)):
                raise ValueError('Invalid asset size/hash: ' + asset.name)
            end = 0
            for chunk in sorted(asset.chunks, key=lambda c: c.offset):
                if not MD5.fullmatch(chunk.md5) or chunk.size <= 0 or chunk.compressed_size <= 0:
                    raise ValueError('Invalid chunk metadata: ' + asset.name)
                if chunk.offset != end:
                    raise ValueError('Overlapping or missing chunk extent: ' + asset.name)
                end += chunk.size
            if not asset.directory and end != asset.size:
                raise ValueError('Incomplete chunk coverage: ' + asset.name)
            if asset.directory and (asset.chunks or asset.size):
                raise ValueError('Invalid directory metadata')
            result[asset.name] = asset
        for name in result:
            for parent in PurePosixPath(name).parents:
                if str(parent) in result and not result[str(parent)].directory:
                    raise ValueError('File is parent of another manifest asset')
        return result

    @property
    def fingerprint(self):
        # URLs may expire or change CDN; file identities determine the transaction.
        value = [self.version, sorted(self.categories), sorted(
            (a.name, a.size, a.md5.lower(), a.directory) for a in self.assets)]
        return hashlib.sha256(json.dumps(value).encode()).hexdigest()


def write_version(root: Path, version: str):
    if not re.fullmatch(r'\d+\.\d+\.\d+', version):
        raise ValueError('Invalid target version')
    config = root / 'config.ini'
    if config.is_symlink():
        raise ValueError('Symlink config.ini')
    contents = config.read_bytes()
    pattern = rb'(?m)^(game_version[ \t]*=[ \t]*)\d+\.\d+\.\d+([ \t]*\r?$)'
    contents, count = re.subn(pattern, lambda m: m[1] + version.encode() + m[2], contents)
    if count != 1:
        raise ValueError('config.ini must contain exactly one game_version')
    temp = root / STATE_DIR / ('config-' + uuid.uuid4().hex)
    with temp.open('xb') as out:
        out.write(contents)
        out.flush()
        os.fsync(out.fileno())
    os.chmod(temp, stat.S_IMODE(config.stat().st_mode))
    os.replace(temp, config)
    sync_dir(root)


class Updater:
    """fetch(chunk, destination) must write exactly the compressed payload.

    All paths owned by this class live on the game's filesystem. No original
    file is removed to make room. A failed disk-space check is recoverable.
    """
    def __init__(self, root: Path, target: Build, source: Build | None, fetch: Callable,
                 *, cancel=None, event=None, obsolete=(), workers=1, chunk_workers=1, local_sources=None):
        self.root = Path(root).absolute()
        if self.root.is_symlink() or self.root.resolve() != self.root:
            raise ValueError('Game root must be a real, canonical directory')
        self.target, self.source, self.fetch = target, source, fetch
        self.fingerprint = target.fingerprint
        self.cancel = cancel
        self.workers = max(1, min(2, workers))
        self.chunk_workers = max(1, min(4, chunk_workers))
        self.state_lock = threading.RLock()
        self.event = event or (lambda _: None)
        self.targets = target.indexed()
        self.sources = source.indexed() if source else {}
        self.local_sources = {}
        for name, candidates in (local_sources or {}).items():
            if name not in self.targets:
                raise ValueError('Local source hint has no target asset')
            self.local_sources[name] = tuple(relative_name(candidate) for candidate in candidates)

        self.obsolete = sorted((set(self.sources) | {relative_name(n) for n in obsolete}) - set(self.targets))
        self.state = safe_path(self.root, 'state-placeholder').parent / STATE_DIR
        if self.state.is_symlink():
            raise ValueError('Symlink updater state')
        self.downloaded = self.reused = self.completed = 0
        self.journal = {}

    def emit(self, stage, filename='', **values):
        self.event(dict(type='update_stage', stage=stage, filename=filename,
                        completed_files=self.completed, total_files=len(self.targets),
                        downloaded_bytes=self.downloaded, reused_bytes=self.reused, **values))

    @contextmanager
    def lock(self):
        self.state.mkdir(exist_ok=True)
        lock = self.state / 'lock'
        if lock.is_symlink():
            raise ValueError('Symlink update lock')
        with lock.open('a') as stream:
            try:
                fcntl.flock(stream, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                raise RuntimeError('Another updater owns this installation') from None
            try:
                yield
            finally:
                fcntl.flock(stream, fcntl.LOCK_UN)

    def _path(self, directory, name):
        directory = self.state / directory
        if directory.is_symlink():
            raise ValueError('Symlink updater directory')
        directory.mkdir(exist_ok=True)
        path = directory / hashlib.sha256(name.encode()).hexdigest()
        if path.is_symlink():
            raise ValueError('Symlink updater file')
        return path

    def save(self):
        with self.state_lock:
            atomic_json(self.state / 'journal.json', self.journal)

    def _begin(self):
        path = self.state / 'journal.json'
        if path.is_symlink():
            raise ValueError('Symlink update journal')
        if path.exists():
            try:
                self.journal = json.loads(path.read_text())
            except (ValueError, OSError):
                raise ValueError('Unreadable update journal; retain state for inspection') from None
            if self.journal.get('target') != self.fingerprint:
                # Preserve the previous transaction; no recovery evidence discarded.
                backup = self.state / ('previous-' + uuid.uuid4().hex)
                backup.mkdir()
                for name in ('journal.json', 'staged', 'obsolete'):
                    current = self.state / name
                    if current.is_symlink():
                        raise ValueError('Symlink updater state')
                    if current.exists():
                        os.replace(current, backup / name)
                self.journal = {}
        if not self.journal:
            self.journal = dict(schema=1, target=self.fingerprint,
                                version=self.target.version, categories=list(self.target.categories),
                                source_version=self.source.version if self.source else None,
                                obsolete=self.obsolete, verified={}, phase='constructing')
        # Keep obsolete ownership through a restart even if the old service expires.
        self.obsolete = sorted({relative_name(n) for n in self.journal['obsolete']} - set(self.targets))
        self.save()

    def _chunk_cache(self, chunk, asset_name):
        return self._path('chunks', self.fingerprint + ':' + asset_name + ':' + chunk.id + ':' + str(chunk.compressed_size))

    def _compressed_valid(self, path, chunk):
        if not path.is_file() or path.stat().st_size != chunk.compressed_size:
            return False
        if chunk.compressed_md5 and hash_file(path, self.cancel) != chunk.compressed_md5.lower():
            return False
        # Maintained Sophon implementations use the ID's first component for
        # compressed XXH64. Protobuf field 6 is not a reliable XXH64 identity.
        match = re.fullmatch(r'([0-9a-fA-F]{16})_[0-9a-fA-F]{32}', chunk.id)
        if match:
            h = xxhash.xxh64()
            with path.open('rb') as f:
                while data := f.read(BLOCK):
                    check_cancel(self.cancel)
                    h.update(data)
            return h.hexdigest() == match[1].lower()
        return True  # decompressed MD5 and final file MD5 remain mandatory

    def _download_chunk(self, chunk, asset_name):
        path = self._chunk_cache(chunk, asset_name)
        if not self._compressed_valid(path, chunk):
            path.unlink(missing_ok=True)
            partial = path.with_suffix('.part-' + uuid.uuid4().hex)
            try:
                self.fetch(chunk, partial)
                check_cancel(self.cancel)
                if not self._compressed_valid(partial, chunk):
                    raise ValueError('Compressed chunk checksum/size mismatch')
                with partial.open('rb') as f:
                    os.fsync(f.fileno())
                os.replace(partial, path)
                with self.state_lock:
                    self.downloaded += chunk.compressed_size
            finally:
                partial.unlink(missing_ok=True)
        return path

    def _copy_chunk(self, stream, offset, chunk, out):
        stream.seek(offset)
        out.seek(chunk.offset)
        digest = hashlib.md5()
        remaining = chunk.size
        while remaining:
            check_cancel(self.cancel)
            data = stream.read(min(BLOCK, remaining))
            if not data:
                return False
            out.write(data)
            digest.update(data)
            remaining -= len(data)
        return digest.hexdigest() == chunk.md5.lower()

    def _decode_chunk(self, path, chunk, out):
        out.seek(chunk.offset)
        digest = hashlib.md5()
        count = 0
        try:
            with path.open('rb') as raw:
                reader = zstandard.ZstdDecompressor().stream_reader(raw) if chunk.compressed else raw
                try:
                    while data := reader.read(min(BLOCK, chunk.size - count + 1)):
                        check_cancel(self.cancel)
                        count += len(data)
                        if count > chunk.size:
                            raise ValueError('Decompressed chunk is too large')
                        digest.update(data)
                        out.write(data)
                finally:
                    if reader is not raw:
                        reader.close()
            if count != chunk.size or digest.hexdigest() != chunk.md5.lower():
                raise ValueError('Decompressed chunk checksum/size mismatch')
        except Exception:
            path.unlink(missing_ok=True)
            raise

    def construct(self, asset, *, predownload=False):
        target = safe_path(self.root, asset.name)
        staged = self._path('staged', self.fingerprint + ':' + asset.name)
        if not predownload and matches(staged, asset.size, asset.md5, self.cancel):
            return staged
        source = self.sources.get(asset.name)
        offsets = {}
        if source:
            for chunk in source.chunks:
                offsets.setdefault(chunk.identity, []).append(chunk.offset)
        # Interrupted runs may have target chunks at their target offsets even
        # when the file's whole hash is wrong. Validate each candidate's bytes.
        candidates = [target] + [safe_path(self.root, name) for name in self.local_sources.get(asset.name, ())]
        old = []
        try:
            for path in dict.fromkeys(candidates):
                if path.is_file():
                    old.append(path.open('rb'))
        except BaseException:
            for stream in old:
                stream.close()
            raise
        used_caches = set()
        part = staged.with_suffix('.part')
        if part.is_symlink():
            raise ValueError('Symlink staging file')
        try:
            # Predownload verifies local candidates using an anonymous disk file;
            # it never publishes a game file or changes config.ini.
            with part.open('wb+') as out:
                missing = {}
                for chunk in asset.chunks:
                    check_cancel(self.cancel)
                    reused = False
                    candidates = list(dict.fromkeys(offsets.get(chunk.identity, []) + [chunk.offset]))
                    for stream in old:
                        for offset in candidates:
                            if self._copy_chunk(stream, offset, chunk, out):
                                with self.state_lock:
                                    self.reused += chunk.size
                                self.emit('reusing', asset.name)
                                reused = True
                                break
                        if reused:
                            break
                    if not reused:
                        key = (chunk.id, chunk.md5, chunk.size, chunk.compressed_size, chunk.compressed_md5)
                        missing.setdefault(key, []).append(chunk)
                    if predownload:
                        # Keep only compressed network chunks, not complete new
                        # assets, while still validating every downloaded chunk.
                        out.seek(0)
                        out.truncate(0)
                # Prefetch at most four compressed chunks per file. Assembly,
                # decompression and whole-file hashing still use only two file
                # workers; network latency must not require many hash workers.
                groups = iter(missing.values())
                pending = deque()
                with concurrent.futures.ThreadPoolExecutor(max_workers=self.chunk_workers) as pool:
                    def submit_next():
                        group = next(groups, None)
                        if group is not None:
                            pending.append((group, pool.submit(self._download_chunk, group[0], asset.name)))
                    for _ in range(self.chunk_workers):
                        submit_next()
                    try:
                        while pending:
                            check_cancel(self.cancel)
                            group, future = pending.popleft()
                            self.emit('downloading', asset.name)
                            cached = future.result()
                            for chunk in group:
                                self._decode_chunk(cached, chunk, out)
                                if predownload:
                                    out.seek(0)
                                    out.truncate(0)
                            if not predownload:
                                used_caches.add(cached)
                            submit_next()
                    finally:
                        for _, future in pending:
                            future.cancel()
                if predownload:
                    return None
                out.truncate(asset.size)
                out.flush()
                self.emit('verifying', asset.name)
                if not matches(part, asset.size, asset.md5, self.cancel):
                    raise ValueError('Final asset checksum mismatch: ' + asset.name)
                os.fsync(out.fileno())
            check_cancel(self.cancel)
            os.replace(part, staged)
            sync_dir(staged.parent)
            for cached in used_caches:
                cached.unlink(missing_ok=True)
            return staged
        finally:
            for stream in old:
                stream.close()
            part.unlink(missing_ok=True)

    def verify(self):
        failures = []
        for asset in self.targets.values():
            check_cancel(self.cancel)
            path = safe_path(self.root, asset.name)
            self.emit('verifying', asset.name)
            valid = path.is_dir() if asset.directory else matches(path, asset.size, asset.md5, self.cancel)
            if not valid:
                failures.append(asset.name)
        return failures

    def run(self, *, predownload=False):
        with self.lock():
            self._begin()
            self.emit('calculating')
            ready = {}
            required = 0
            for asset in self.targets.values():
                check_cancel(self.cancel)
                self.emit('verifying', asset.name)
                path = safe_path(self.root, asset.name)
                if asset.directory:
                    continue
                if matches(path, asset.size, asset.md5, self.cancel):
                    self.completed += 1
                    continue
                stage = self._path('staged', self.fingerprint + ':' + asset.name)
                if not matches(stage, asset.size, asset.md5, self.cancel):
                    required += asset.size
                ready[asset.name] = stage
            # Reserve room for journal, largest compressed chunk and filesystem
            # metadata; never reclaim space by deleting the source installation.
            if not predownload and shutil.disk_usage(self.root).free < required + 64 * BLOCK:
                raise OSError('Insufficient disk space to stage verified replacements safely')
            def construct_one(name):
                asset = self.targets[name]
                self.emit('assembling', name)
                self.construct(asset, predownload=predownload)
                with self.state_lock:
                    self.completed += 1
                    if not predownload:
                        self.journal['verified'][name] = asset.md5
                        self.save()
            with concurrent.futures.ThreadPoolExecutor(max_workers=self.workers) as pool:
                for result in pool.map(construct_one, ready):
                    pass
            if predownload:
                self.emit('predownload_complete')
                return dict(version=self.target.version, predownload=True, downloaded=self.downloaded, reused=self.reused)
            check_cancel(self.cancel)
            self.journal['phase'] = 'publishing'
            self.save()
            for asset in self.targets.values():
                check_cancel(self.cancel)
                dest = safe_path(self.root, asset.name)
                if asset.directory:
                    dest.mkdir(parents=True, exist_ok=True)
                    continue
                if asset.name not in ready:
                    continue
                stage = ready[asset.name]
                # Revalidate staging on every restart; no journal entry alone
                # grants permission to publish corrupt data.
                if not matches(stage, asset.size, asset.md5, self.cancel):
                    raise ValueError('Staged asset changed: ' + asset.name)
                dest.parent.mkdir(parents=True, exist_ok=True)
                safe_path(self.root, asset.name)
                if dest.exists():
                    os.chmod(stage, stat.S_IMODE(dest.stat().st_mode))
                os.replace(stage, dest)
                sync_dir(dest.parent)
            failures = self.verify()
            if failures:
                raise ValueError('Target verification failed: ' + ', '.join(failures[:5]))
            self.journal['phase'] = 'deleting'
            self.save()
            for name in self.obsolete:
                check_cancel(self.cancel)
                old = safe_path(self.root, name)
                self.emit('deleting', name)
                if old.is_file():
                    quarantine = self._path('obsolete', name)
                    if quarantine.exists():
                        raise ValueError('Obsolete asset reappeared; retain both copies for inspection: ' + name)
                    os.replace(old, quarantine)
                    sync_dir(old.parent)
                    sync_dir(quarantine.parent)
                elif old.is_dir():
                    # Only remove known empty directories; never recurse into
                    # user saves, WPF, SDKs, plugins or other unowned files.
                    try:
                        old.rmdir()
                    except OSError:
                        pass
            check_cancel(self.cancel)
            self.emit('finalizing')
            check_cancel(self.cancel)
            write_version(self.root, self.target.version)
            self.journal['phase'] = 'complete'
            self.save()
            self.emit('complete')
            return dict(version=self.target.version, verified_files=len(self.targets),
                        categories=list(self.target.categories), downloaded=self.downloaded, reused=self.reused)
