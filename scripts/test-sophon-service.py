#!/usr/bin/env python3
"""Deterministic protocol-provider tests; all service responses are synthetic."""
import copy
import hashlib
import io
import json
import pathlib
import ssl
import sys
import tempfile
import unittest
from unittest.mock import patch
from urllib import error, parse

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "sophon_server"))
import manifest_pb2
import zstandard
import sophon_full as service

SECRET = 'fixture-secret-do-not-persist'
BRANCH = dict(branch='main', package_id='fixture-package', password=SECRET, tag='2.0.0')


def digest(data):
    return hashlib.md5(data).hexdigest()


def manifest_fixture(name='GenshinImpact.exe', data=b'verified target executable', *, compression=1):
    payload = zstandard.ZstdCompressor().compress(data) if compression else data
    pb = manifest_pb2.Manifest()
    asset = pb.files.add(filename=name, size=len(data), md5=digest(data))
    asset.chunks.add(chunk_id='fixture-chunk', md5=digest(data), offset=0,
                     compressed_size=len(payload), uncompressed_size=len(data),
                     compressed_md5=digest(payload))
    raw = pb.SerializeToString()
    wire = zstandard.ZstdCompressor().compress(raw) if compression else raw
    category = dict(matching_field='game', manifest=dict(id='fixture-manifest', checksum=digest(raw),
                      compressed_size=str(len(wire)), uncompressed_size=str(len(raw))),
                    manifest_download=dict(url_prefix='https://fixture.invalid/manifests', compression=compression),
                    chunk_download=dict(url_prefix='https://fixture.invalid/chunks', compression=compression))
    return category, wire, payload, raw


class FakeTransport:
    def __init__(self, category, wire, chunk, *, source_available=True):
        self.category, self.wire, self.chunk_data = category, wire, chunk
        self.source_available = source_available
        self.calls = []
        self.downloads = []

    def json(self, url):
        parsed = parse.urlsplit(url)
        query = parse.parse_qs(parsed.query)
        self.calls.append((parsed.path, query))
        if parsed.path.endswith('getGameBranches'):
            return {'game_branches': [{'main': dict(BRANCH), 'pre_download': dict(BRANCH, branch='pre_download')} ]}
        tag = query['tag'][0]
        if tag == '1.0.0' and not self.source_available:
            raise service.ServiceError('Sophon HTTP 404')
        return dict(tag=tag, manifests=[self.category])

    def download(self, url, destination, expected_size):
        self.downloads.append((url, expected_size))
        destination.write_bytes(self.wire if '/manifests/' in url else self.chunk_data)

    def chunk(self, chunk, destination):
        self.download(chunk.url, destination, chunk.compressed_size)


class ServiceTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = pathlib.Path(self.temp.name).resolve() / 'game'
        self.root.mkdir()
        (self.root / 'GenshinImpact_Data').mkdir()
        (self.root / 'config.ini').write_text('[General]\ngame_version=1.0.0\nchannel=1\n')
        self.cache = pathlib.Path(self.temp.name).resolve() / 'cache'
        self.category, self.wire, self.payload, self.raw = manifest_fixture()
        self.transport = FakeTransport(self.category, self.wire, self.payload)
        self.service = service.Service('os', self.cache, transport=self.transport)

    def tearDown(self):
        self.temp.cleanup()

    def test_explicit_source_tag_is_sent_on_ordinary_full_build_url(self):
        target = self.service.build(BRANCH)
        source = self.service.build(BRANCH, '1.0.0')
        self.assertEqual(target['tag'], '2.0.0')
        self.assertEqual(source['tag'], '1.0.0')
        self.assertEqual([q['tag'][0] for _, q in self.transport.calls], ['2.0.0', '1.0.0'])
        self.assertTrue(all(path.endswith('/getBuild') for path, _ in self.transport.calls))
        self.assertFalse(self.cache.exists(), 'Build responses and passwords are memory-only')

    def test_wrong_build_version_cannot_be_used_as_requested_source(self):
        with patch.object(self.transport, 'json', return_value={'tag': '2.0.0', 'manifests': []}):
            with self.assertRaisesRegex(service.ServiceError, 'unexpected build version'):
                self.service.build(BRANCH, '1.0.0')

    def test_source_unavailable_falls_back_to_verified_target_download(self):
        self.transport.source_available = False
        events = []
        (self.root / 'obsolete.dll').write_bytes(b'old')
        (self.root / 'pkg_version').write_text(json.dumps({'remoteName': 'obsolete.dll', 'md5': digest(b'old')}) + '\n')
        with patch.object(service, 'Transport', return_value=self.transport):
            updater = service.prepare_update(self.root, self.cache, event=events.append)
            self.assertIsNone(updater.source)
            result = updater.run()
        self.assertEqual(result['version'], '2.0.0')
        self.assertEqual(updater.verify(), [])
        self.assertEqual((self.root / 'GenshinImpact.exe').read_bytes(), b'verified target executable')
        self.assertIn('game_version=2.0.0', (self.root / 'config.ini').read_text())
        self.assertFalse((self.root / 'obsolete.dll').exists())
        self.assertTrue(any(event.get('source_available') is False for event in events))
        for file in pathlib.Path(self.temp.name).rglob('*'):
            if file.is_file():
                self.assertNotIn(SECRET.encode(), file.read_bytes())

    def test_partial_install_region_and_version_do_not_require_executable(self):
        self.assertFalse((self.root / 'GenshinImpact.exe').exists())
        self.assertEqual(service.installation(self.root), ('os', '1.0.0', 'GenshinImpact_Data', ''))

    def test_language_selection_preserves_markers_inventory_and_actual_audio(self):
        marker = self.root / 'GenshinImpact_Data/Persistent/audio_lang_14'
        marker.parent.mkdir()
        marker.write_text('English(US)\n')
        (self.root / 'Audio_Japanese_pkg_version').write_text('')
        audio = self.root / 'GenshinImpact_Data/StreamingAssets/AudioAssets/Korean/test.pck'
        audio.parent.mkdir(parents=True)
        audio.write_bytes(b'voice')
        categories = ['game', 'en-us', 'ja-jp', 'ko-kr', 'zh-cn', 'module', 'mini-ja']
        branch = dict(BRANCH, categories=[
            dict(matching_field='module', type='CATEGORY_TYPE_RESOURCE', scenarios=['CATEGORY_SCENARIO_FULL']),
            dict(matching_field='mini-ja', type='CATEGORY_TYPE_AUDIO', scenarios=[]),
        ])
        selected = self.service.select(self.root, 'GenshinImpact_Data', branch,
                                       {'manifests': [dict(matching_field=name) for name in categories]})
        self.assertEqual(selected, ('game', 'en-us', 'ja-jp', 'ko-kr', 'module'))

    def test_unknown_category_and_missing_installed_language_fail_closed(self):
        with self.assertRaisesRegex(service.ServiceError, 'Unknown Sophon package category'):
            self.service.select(self.root, 'GenshinImpact_Data', BRANCH,
                                {'manifests': [dict(matching_field='game'), dict(matching_field='new-module')]})
        (self.root / 'Audio_Japanese_pkg_version').write_text('')
        with self.assertRaisesRegex(service.ServiceError, 'missing a required installed package'):
            self.service.select(self.root, 'GenshinImpact_Data', BRANCH,
                                {'manifests': [dict(matching_field='game')]})

    def test_manifest_checksum_is_of_decompressed_protobuf_and_field7_propagates(self):
        loaded = self.service.load({'tag': '2.0.0', 'manifests': [self.category]}, ('game',))
        chunk = loaded.assets[0].chunks[0]
        self.assertEqual(chunk.compressed_md5, digest(self.payload))
        self.assertTrue(chunk.compressed)
        self.assertEqual((self.cache / (digest(self.raw) + '.pb')).read_bytes(), self.raw)
        self.assertNotEqual(digest(self.wire), self.category['manifest']['checksum'])
        self.service.load({'tag': '2.0.0', 'manifests': [self.category]}, ('game',))
        self.assertEqual(len(self.transport.downloads), 1)

    def test_uncompressed_manifest_and_chunks_are_supported(self):
        category, wire, payload, _ = manifest_fixture(compression=0)
        provider = service.Service('os', self.cache, transport=FakeTransport(category, wire, payload))
        loaded = provider.load({'tag': '2.0.0', 'manifests': [category]}, ('game',))
        self.assertFalse(loaded.assets[0].chunks[0].compressed)
        self.assertEqual(loaded.assets[0].chunks[0].compressed_md5, digest(payload))

    def test_wrong_decompressed_checksum_or_size_never_populates_cache(self):
        for name, value in [('checksum', '0' * 32), ('uncompressed_size', str(len(self.raw) - 1)),
                            ('uncompressed_size', str(len(self.raw) + 1))]:
            with self.subTest(name=name, value=value):
                category = copy.deepcopy(self.category)
                category['manifest'][name] = value
                with self.assertRaises(service.ServiceError):
                    self.service.manifest(category)
                self.assertEqual(list(self.cache.glob('*.pb')), [])

    def test_corrupt_manifest_cache_is_replaced_only_after_verification(self):
        self.cache.mkdir()
        cached = self.cache / (digest(self.raw) + '.pb')
        cached.write_bytes(b'x' * len(self.raw))
        self.service.manifest(self.category)
        self.assertEqual(cached.read_bytes(), self.raw)

    def test_unsupported_compression_and_encryption_rejected(self):
        for field, value in [('compression', 7), ('encryption', 1)]:
            category = copy.deepcopy(self.category)
            category['manifest_download'][field] = value
            with self.subTest(field=field), self.assertRaisesRegex(service.ServiceError, 'Unsupported Sophon'):
                self.service.manifest(category)

    def test_manifest_path_traversal_rejected_before_game_mutation(self):
        category, wire, payload, _ = manifest_fixture('../outside')
        provider = service.Service('os', self.cache, transport=FakeTransport(category, wire, payload))
        with self.assertRaisesRegex(ValueError, 'manifest path'):
            provider.load({'tag': '2.0.0', 'manifests': [category]}, ('game',))
        self.assertFalse((self.root.parent / 'outside').exists())

    def test_optional_wpf_install_is_not_silently_left_outdated(self):
        (self.root / 'BeyondAssets').mkdir()
        with patch.object(service, 'Transport', return_value=self.transport):
            with self.assertRaisesRegex(service.ServiceError, 'WPF'):
                service.prepare_update(self.root, self.cache)
        self.assertIn('game_version=1.0.0', (self.root / 'config.ini').read_text())
        self.assertFalse((self.root / 'GenshinImpact.exe').exists())

    def test_persistent_voice_cache_is_reused_without_moving_or_deleting_it(self):
        self.check_persistent_voice_alias(corrupt=False)

    def test_corrupt_persistent_voice_chunk_is_downloaded_without_modifying_cache(self):
        self.check_persistent_voice_alias(corrupt=True)

    def check_persistent_voice_alias(self, *, corrupt):
        # The official source manifest names StreamingAssets, while an in-game
        # language installation may actually live under Persistent/AudioAssets.
        name = 'GenshinImpact_Data/StreamingAssets/AudioAssets/English(US)/voice.pck'
        persistent = self.root / name.replace('/StreamingAssets/', '/Persistent/')
        persistent.parent.mkdir(parents=True)
        common, old_only, new_only = b'common-voice', b'old-voice', b'new-voice'
        original = old_only + (b'x' * len(common) if corrupt else common)
        persistent.write_bytes(original)
        payloads = {}

        def category(category_name, version, chunks):
            pb = manifest_pb2.Manifest()
            if chunks:
                value = b''.join(chunks)
                asset = pb.files.add(filename=name, size=len(value), md5=digest(value))
                offset = 0
                for block in chunks:
                    chunk_id = digest(block)
                    compressed = zstandard.ZstdCompressor().compress(block)
                    payloads[chunk_id] = compressed
                    asset.chunks.add(chunk_id=chunk_id, md5=digest(block), offset=offset,
                                     compressed_size=len(compressed), uncompressed_size=len(block),
                                     compressed_md5=digest(compressed))
                    offset += len(block)
            raw = pb.SerializeToString()
            wire = zstandard.ZstdCompressor().compress(raw)
            manifest_id = category_name + '-' + version
            payloads[manifest_id] = wire
            return dict(matching_field=category_name,
                        manifest=dict(id=manifest_id, checksum=digest(raw), compressed_size=len(wire), uncompressed_size=len(raw)),
                        manifest_download=dict(url_prefix='https://fixture.invalid/manifests', compression=1),
                        chunk_download=dict(url_prefix='https://fixture.invalid/chunks', compression=1))

        builds = {version: dict(tag=version, manifests=[category('game', version, []),
                                                       category('en-us', version, chunks)])
                  for version, chunks in [('1.0.0', [old_only, common]), ('2.0.0', [common, new_only])]}
        downloaded_chunks = []
        class VoiceTransport:
            def json(self, url):
                parsed = parse.urlsplit(url)
                if parsed.path.endswith('getGameBranches'):
                    return {'game_branches': [{'main': dict(BRANCH)}]}
                return builds[parse.parse_qs(parsed.query)['tag'][0]]

            def download(self, url, destination, expected_size):
                chunk_id = parse.urlsplit(url).path.rsplit('/', 1)[1]
                if '/chunks/' in url:
                    downloaded_chunks.append(chunk_id)
                destination.write_bytes(payloads[chunk_id])

            def chunk(self, chunk, destination):
                self.download(chunk.url, destination, chunk.compressed_size)

        with patch.object(service, 'Transport', return_value=VoiceTransport()):
            updater = service.prepare_update(self.root, self.cache)
            result = updater.run()
        self.assertEqual(updater.verify(), [])
        self.assertEqual((self.root / name).read_bytes(), common + new_only)
        self.assertEqual(persistent.read_bytes(), original)
        self.assertEqual(result['reused'], 0 if corrupt else len(common))
        self.assertEqual(set(downloaded_chunks), {digest(common), digest(new_only)} if corrupt else {digest(new_only)})
        self.assertIn('en-us', result['categories'])


class TransportTests(unittest.TestCase):
    def test_tls_verification_and_sanitized_http_error(self):
        transport = service.Transport()
        self.assertEqual(transport.context.verify_mode, ssl.CERT_REQUIRED)
        self.assertTrue(transport.context.check_hostname)
        url = 'https://fixture.invalid/getBuild?password=' + SECRET
        with patch.object(service.request, 'urlopen', side_effect=error.HTTPError(url, 403, SECRET, {}, None)):
            with self.assertRaises(service.ServiceError) as caught:
                transport.open(url)
        self.assertEqual(str(caught.exception), 'Sophon HTTP 403')
        self.assertNotIn(SECRET, str(caught.exception))

    def test_response_message_and_credentials_are_excluded_from_errors(self):
        transport = service.Transport()
        with patch.object(transport, 'open', return_value=io.BytesIO(json.dumps({'retcode': -1, 'message': SECRET}).encode())):
            with self.assertRaises(service.ServiceError) as caught:
                transport.json('https://fixture.invalid')
        self.assertNotIn(SECRET, str(caught.exception))

    def test_non_https_endpoint_rejected(self):
        with self.assertRaisesRegex(service.ServiceError, 'HTTPS'):
            service.Transport().open('http://fixture.invalid')


if __name__ == '__main__':
    unittest.main()
