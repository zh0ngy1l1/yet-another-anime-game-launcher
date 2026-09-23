"""Current Sophon build discovery and package selection; no credential cache."""
from __future__ import annotations

import configparser
import hashlib
import io
import json
import os
from pathlib import Path
import re
import ssl
import time
import threading
from urllib import request, parse, error

import certifi
import zstandard
import manifest_pb2
from full_update import Asset, Build, Chunk, Updater, check_cancel, hash_file, relative_name, safe_path

LANGUAGES = {'en-us': 'English(US)', 'ja-jp': 'Japanese', 'ko-kr': 'Korean', 'zh-cn': 'Chinese'}
REGIONS = {
    'os': ('https://sg-hyp-api.hoyoverse.com/hyp/hyp-connect/api', 'VYTpXlbWo8', 'gopR6Cufr3', 'https://sg-public-api.hoyoverse.com'),
    'cn': ('https://hyp-api.mihoyo.com/hyp/hyp-connect/api', 'jGHBHlcOq1', '1Z8W5NHUQb', 'https://api-takumi.mihoyo.com'),
    'bb': ('https://hyp-api.mihoyo.com/hyp/hyp-connect/api', 'umfgRO5gh5', 'T2S0Gz4Dr2', 'https://api-takumi.mihoyo.com'),
}


class ServiceError(RuntimeError):
    """Deliberately excludes request URLs, response bodies and credentials."""


class Transport:
    def __init__(self, cancel=None):
        self.cancel = cancel
        self.local = threading.local()
        self.context = ssl.create_default_context(cafile=certifi.where())

    def open(self, url):
        parsed = parse.urlsplit(url)
        if parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.password:
            raise ServiceError('Sophon requires a valid HTTPS endpoint')
        try:
            return request.urlopen(request.Request(url, headers={'User-Agent': 'YAAGL-Sophon/1'}),
                                   timeout=45, context=self.context)
        except error.HTTPError as exc:
            raise ServiceError(f'Sophon HTTP {exc.code}') from None
        except (OSError, error.URLError):
            raise ServiceError('Sophon connection failed (TLS verification enabled)') from None

    def json(self, url):
        with self.open(url) as response:
            payload = response.read(8 * 1024 * 1024 + 1)
        if len(payload) > 8 * 1024 * 1024:
            raise ServiceError('Sophon metadata response exceeds limit')
        try:
            value = json.loads(payload)
        except ValueError:
            raise ServiceError('Sophon returned invalid JSON') from None
        if value.get('retcode') != 0 or not isinstance(value.get('data'), dict):
            raise ServiceError('Sophon metadata request rejected (retcode ' + str(value.get('retcode')) + ')')
        return value['data']

    def download(self, url, destination, expected_size):
        for attempt in range(3):
            check_cancel(self.cancel)
            try:
                with self.open(url) as response, destination.open('wb') as out:
                    length = response.headers.get('Content-Length')
                    if response.status != 200 or (length is not None and int(length) != expected_size):
                        raise ServiceError('Unexpected Sophon download status/length')
                    count = 0
                    while data := response.read(min(1024 * 1024, expected_size - count + 1)):
                        check_cancel(self.cancel)
                        count += len(data)
                        if count > expected_size:
                            raise ServiceError('Sophon download exceeds expected size')
                        out.write(data)
                    if count != expected_size:
                        raise ServiceError('Truncated Sophon download')
                    out.flush()
                    os.fsync(out.fileno())
                return
            except (ServiceError, error.URLError, TimeoutError, ConnectionError) as exc:
                destination.unlink(missing_ok=True)
                if attempt == 2:
                    raise ServiceError('Sophon download failed after three attempts') from None
                if self.cancel:
                    self.cancel.wait(attempt + 1)
                else:
                    time.sleep(attempt + 1)

    def chunk(self, chunk, destination):
        # One reusable TLS connection per bounded download worker. No URL or
        # libcurl error string is logged: either can contain signed credentials.
        import pycurl
        parsed = parse.urlsplit(chunk.url)
        if parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.password:
            raise ServiceError('Sophon requires a valid HTTPS chunk endpoint')
        curl = getattr(self.local, 'curl', None)
        if curl is None:
            curl = self.local.curl = pycurl.Curl()
        for attempt in range(3):
            check_cancel(self.cancel)
            curl.reset()
            curl.setopt(pycurl.URL, chunk.url)
            curl.setopt(pycurl.CAINFO, certifi.where())
            curl.setopt(pycurl.SSL_VERIFYPEER, 1)
            curl.setopt(pycurl.SSL_VERIFYHOST, 2)
            curl.setopt(pycurl.FOLLOWLOCATION, 1)
            curl.setopt(pycurl.PROTOCOLS, pycurl.PROTO_HTTPS)
            curl.setopt(pycurl.REDIR_PROTOCOLS, pycurl.PROTO_HTTPS)
            curl.setopt(pycurl.CONNECTTIMEOUT, 20)
            curl.setopt(pycurl.TIMEOUT, 120)
            curl.setopt(pycurl.FAILONERROR, 1)
            count = 0
            try:
                with destination.open('wb') as out:
                    def write(data):
                        nonlocal count
                        if self.cancel and self.cancel.is_set():
                            return 0
                        count += len(data)
                        if count > chunk.compressed_size:
                            return 0
                        return out.write(data)
                    curl.setopt(pycurl.WRITEFUNCTION, write)
                    curl.perform()
                    check_cancel(self.cancel)
                    if curl.getinfo(pycurl.RESPONSE_CODE) != 200 or count != chunk.compressed_size:
                        raise ServiceError('Truncated or unexpected Sophon chunk response')
                    out.flush()
                    os.fsync(out.fileno())
                return
            except (pycurl.error, ServiceError):
                destination.unlink(missing_ok=True)
                check_cancel(self.cancel)
                if attempt == 2:
                    raise ServiceError('Sophon chunk download failed after three attempts') from None
                if self.cancel:
                    self.cancel.wait(attempt + 1)
                else:
                    time.sleep(attempt + 1)
            finally:
                # Release callback's closed file reference; retain TLS pool.
                curl.setopt(pycurl.WRITEFUNCTION, lambda data: len(data))


def content_url(descriptor, name):
    if descriptor.get('encryption', 0) != 0 or descriptor.get('compression', 0) not in (0, 1):
        raise ServiceError('Unsupported Sophon encryption/compression')
    if not re.fullmatch(r'[A-Za-z0-9_.-]+', name):
        raise ServiceError('Invalid Sophon content identifier')
    return descriptor['url_prefix'].rstrip('/') + '/' + name + descriptor.get('url_suffix', '')


def installation(root):
    root = Path(root)
    config = configparser.ConfigParser()
    config.read(root / 'config.ini')
    general = config['General']
    version = general.get('game_version', '')
    if not re.fullmatch(r'\d+\.\d+\.\d+', version):
        raise ValueError('Cannot determine installed version from config.ini')
    if (root / 'GenshinImpact_Data').is_dir():
        region, data = 'os', 'GenshinImpact_Data'
    elif (root / 'YuanShen_Data').is_dir():
        region = 'bb' if general.get('channel') == '14' else 'cn'
        data = 'YuanShen_Data'
    else:
        raise ValueError('Cannot determine Genshin data directory')
    return region, version, data, general.get('wpf_version', '')


def installed_languages(root, data):
    root = Path(root)
    selected = set()
    marker = root / data / 'Persistent/audio_lang_14'
    lines = set(marker.read_text().splitlines()) if marker.is_file() else set()
    for short, friendly in LANGUAGES.items():
        directories = [root / data / area / 'AudioAssets' / friendly
                       for area in ('StreamingAssets', 'Persistent')]
        if (friendly in lines or short in lines or
                (root / f'Audio_{friendly}_pkg_version').is_file() or
                any(directory.is_dir() and next(directory.rglob('*.pck'), None) is not None
                    for directory in directories)):
            selected.add(short)
    return selected


def installed_inventory(root, data):
    """Fallback ownership evidence, captured before target pkg_version replaces it."""
    root = Path(root)
    names = set()
    files = [root / 'pkg_version'] + [root / f'Audio_{v}_pkg_version' for v in LANGUAGES.values()]
    for filename in files:
        if not filename.is_file() or filename.is_symlink():
            continue
        with filename.open() as source:
            for line in source:
                try:
                    value = json.loads(line)
                    name = relative_name(value['remoteName'])
                    if not re.fullmatch(r'[0-9a-fA-F]{32}', value['md5']):
                        raise ValueError()
                    names.add(name)
                except (ValueError, KeyError, TypeError):
                    raise ValueError('Invalid installed package inventory: ' + filename.name) from None
    return names


class Service:
    def __init__(self, region, cache, *, cancel=None, transport=None):
        if region not in REGIONS:
            raise ValueError('Unknown Genshin release type')
        self.api, self.launcher_id, self.game_id, self.build_api = REGIONS[region]
        self.cache = Path(cache)
        self.transport = transport or Transport(cancel)
        self.cancel = cancel

    def branch(self, predownload=False):
        data = self.transport.json(self.api + '/getGameBranches?' + parse.urlencode(
            {'launcher_id': self.launcher_id, 'game_ids[]': self.game_id}))
        branch = data['game_branches'][0]['pre_download' if predownload else 'main']
        if not branch:
            raise ServiceError('No pre-download build is available')
        return branch

    def build(self, branch, version=None):
        query = {key: branch[key] for key in ('branch', 'package_id', 'password')}
        query['tag'] = version or branch['tag']
        value = self.transport.json(self.build_api + '/downloader/sophon_chunk/api/getBuild?' + parse.urlencode(query))
        if value.get('tag') != query['tag'] or not isinstance(value.get('manifests'), list):
            raise ServiceError('Sophon returned an unexpected build version')
        return value

    def select(self, root, data, branch, build):
        languages = installed_languages(root, data)
        categories = {c['matching_field']: c for c in branch.get('categories', [])}
        chosen = []
        for category in build['manifests']:
            name = category['matching_field']
            metadata = categories.get(name, {})
            kind = metadata.get('type')
            scenarios = metadata.get('scenarios', [])
            if name in LANGUAGES or kind == 'CATEGORY_TYPE_AUDIO':
                # Do not automatically install new languages or miniature packs.
                if name in languages:
                    chosen.append(name)
            elif name == 'game' or (kind == 'CATEGORY_TYPE_RESOURCE' and 'CATEGORY_SCENARIO_FULL' in scenarios):
                chosen.append(name)
            else:
                raise ServiceError('Unknown Sophon package category requires selection support: ' + name)
        if 'game' not in chosen or not languages.issubset(set(chosen)):
            raise ServiceError('Target build is missing a required installed package')
        return tuple(chosen)

    def manifest(self, category):
        descriptor = category['manifest']
        md5 = descriptor['checksum'].lower()
        if not re.fullmatch(r'[0-9a-f]{32}', md5):
            raise ServiceError('Invalid manifest checksum')
        self.cache.mkdir(parents=True, exist_ok=True)
        if self.cache.is_symlink():
            raise ValueError('Symlink manifest cache')
        cached = self.cache / (md5 + '.pb')
        size = int(descriptor['uncompressed_size'])
        if size < 0 or size > 256 * 1024 * 1024:
            raise ServiceError('Manifest exceeds supported size limit')
        if cached.is_symlink():
            raise ValueError('Symlink manifest cache entry')
        if not cached.is_file() or cached.stat().st_size != size or hash_file(cached, self.cancel) != md5:
            import tempfile
            with tempfile.TemporaryDirectory(dir=self.cache) as tmp:
                compressed = Path(tmp) / 'manifest'
                dl = category['manifest_download']
                url = content_url(dl, descriptor['id'])
                self.transport.download(url, compressed, int(descriptor['compressed_size']))
                raw = Path(tmp) / 'parsed'
                digest = hashlib.md5()
                with compressed.open('rb') as stream, raw.open('wb') as out:
                    reader = zstandard.ZstdDecompressor().stream_reader(stream) if dl.get('compression') == 1 else stream
                    count = 0
                    try:
                        while block := reader.read(min(1024 * 1024, size - count + 1)):
                            check_cancel(self.cancel)
                            count += len(block)
                            if count > size:
                                raise ServiceError('Manifest decompressed size overflow')
                            digest.update(block)
                            out.write(block)
                    finally:
                        if reader is not stream:
                            reader.close()
                if count != size or digest.hexdigest() != md5:
                    raise ServiceError('Manifest checksum/size mismatch')
                os.replace(raw, cached)
        pb = manifest_pb2.Manifest()
        pb.ParseFromString(cached.read_bytes())  # bounded metadata only, never a game asset
        return pb

    def load(self, build, categories):
        available = {c['matching_field']: c for c in build['manifests']}
        assets = []
        for name in categories:
            if name not in available:
                raise ServiceError('Build lacks selected package: ' + name)
            category = available[name]
            pb = self.manifest(category)
            dl = category['chunk_download']
            for file in pb.files:
                if file.flags not in (0, 64):
                    raise ServiceError('Unknown Sophon asset flags')
                chunks = tuple(Chunk(c.chunk_id, c.md5, c.offset, c.uncompressed_size,
                                     c.compressed_size, content_url(dl, c.chunk_id),
                                     dl.get('compression') == 1, c.compressed_md5) for c in file.chunks)
                assets.append(Asset(file.filename, file.size, file.md5, chunks, file.flags == 64))
        result = Build(build['tag'], tuple(assets), tuple(categories))
        result.indexed()
        return result


def prepare_update(root, cache, *, predownload=False, cancel=None, event=None):
    event = event or (lambda _: None)
    region, version, data, wpf = installation(root)
    event(dict(type='update_stage', stage='manifests', filename=''))
    service = Service(region, cache, cancel=cancel)
    branch = service.branch(predownload)
    target_json = service.build(branch)
    categories = service.select(root, data, branch, target_json)
    target = service.load(target_json, categories)
    source = None
    try:
        source_json = service.build(branch, version)
        source_categories = tuple(c for c in categories if c in {m['matching_field'] for m in source_json['manifests']})
        source = service.load(source_json, source_categories)
    except ServiceError:
        event(dict(type='update_stage', stage='manifests', filename='', source_available=False))
    # The separate optional editor has its own archive/version protocol. It is
    # not an ordinary Sophon language/resource module and must not be silently
    # left stale if installed. No optional editor is added to normal installs.
    if wpf or (Path(root) / 'beyond_pkg_version').exists() or (Path(root) / 'BeyondAssets').exists():
        raise ServiceError('Installed optional WPF editor requires archive update support')
    obsolete = installed_inventory(root, data)
    # In-game downloads use Persistent while full launcher manifests describe
    # StreamingAssets. Treat matching-path files there only as untrusted byte
    # sources: verify every candidate chunk and never publish/delete the cache.
    local_sources = {}
    prefix = data + '/StreamingAssets/'
    for asset in target.assets:
        if asset.name.startswith(prefix):
            candidate = data + '/Persistent/' + asset.name[len(prefix):]
            if safe_path(Path(root), candidate).is_file():
                local_sources[asset.name] = (candidate,)
    return Updater(Path(root), target, source, service.transport.chunk, cancel=cancel,
                   event=event, obsolete=obsolete, workers=2, chunk_workers=4, local_sources=local_sources)
