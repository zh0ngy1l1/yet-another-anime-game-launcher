#!/usr/bin/env python3
"""Harmless filesystem regressions for evidence preservation."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
import sys
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('collector', Path(__file__).with_name('collect-hk4e-launch-evidence.py'))
collector = importlib.util.module_from_spec(spec)
spec.loader.exec_module(collector)


class EvidenceTest(unittest.TestCase):
    @unittest.skipUnless(sys.platform == 'darwin', 'APFS descriptor cloning is macOS-specific')
    def test_apfs_clone_is_independent_complete_and_does_not_replace_existing_evidence(self):
        with tempfile.TemporaryDirectory(prefix='yaagl-clone-evidence-test-') as name:
            root = Path(name).resolve()
            source = root / 'source.log'
            source.write_bytes(b'complete\x00evidence\n')
            out = root / 'capture'
            out.mkdir()
            capture = collector.Capture(out, clone_files=True)
            capture.copy(source)
            entry = capture.entries[str(source)]
            self.assertTrue(entry['stable'], entry)
            self.assertEqual(entry['copyMethod'], 'APFS clone of retained descriptor')
            copied = out / entry['copy']
            self.assertNotEqual(copied.stat().st_ino, source.stat().st_ino)
            source.write_text('later source change')
            self.assertEqual(copied.read_bytes(), b'complete\x00evidence\n')
            again = collector.Capture(out, clone_files=True)
            again.copy(source)
            self.assertIn('error', again.entries[str(source)])
            self.assertEqual(copied.read_bytes(), b'complete\x00evidence\n')

    def test_clone_failure_is_visible_without_ordinary_copy_fallback(self):
        with tempfile.TemporaryDirectory(prefix='yaagl-clone-evidence-test-') as name:
            root = Path(name).resolve()
            source = root / 'source.log'
            source.write_text('keep original')
            out = root / 'capture'
            out.mkdir()
            capture = collector.Capture(out, clone_files=True)
            with patch.object(collector, 'clone_descriptor', side_effect=OSError('clone unavailable')):
                capture.copy(source)
            entry = capture.entries[str(source)]
            self.assertIn('clone unavailable', entry['error'])
            self.assertNotIn('copied', entry)
            self.assertEqual(source.read_text(), 'keep original')
            self.assertFalse((out / 'files' / source.relative_to('/')).exists())

    @unittest.skipUnless(sys.platform == 'darwin', 'APFS descriptor cloning is macOS-specific')
    def test_cloned_live_log_records_growth_without_claiming_atomic_source_stability(self):
        with tempfile.TemporaryDirectory(prefix='yaagl-clone-evidence-test-') as name:
            root = Path(name).resolve()
            source = root / 'source.log'
            source.write_text('before')
            out = root / 'capture'
            out.mkdir()
            original_clone = collector.clone_descriptor
            def growing_clone(fd, destination):
                original_clone(fd, destination)
                with source.open('a') as stream:
                    stream.write(' after')
            capture = collector.Capture(out, clone_files=True)
            with patch.object(collector, 'clone_descriptor', growing_clone):
                capture.copy(source)
            entry = capture.entries[str(source)]
            self.assertTrue(entry['copied'])
            self.assertFalse(entry['stable'])
            self.assertEqual(entry['capturedBytes'], 6)
            self.assertEqual((out / entry['copy']).read_text(), 'before')

    def test_unix_only_run_supersedes_older_disabled_log(self):
        paths = [Path('game_100000.log'), Path('game_200000.log.wine.log'),
                 Path('game_200000.log.steam.log'), Path('game_300000.log.old')]
        epochs = [epoch for p in paths if (epoch := collector.game_log_epoch(p)) is not None]
        self.assertEqual(max(epochs), 200)
        self.assertIsNone(collector.game_log_epoch(Path('game_invalid.log.wine.log')))

    def test_bridge_only_run_is_copied_and_records_missing_base(self):
        with tempfile.TemporaryDirectory(prefix='yaagl-evidence-test-') as name:
            root = Path(name).resolve()
            profile = root / 'profile'
            logs = profile / 'logs'
            logs.mkdir(parents=True)
            (logs / 'game_100000.log').write_text('earlier disabled output')
            bridge = logs / 'game_200000.log.bridge.log'
            bridge.write_text('worker applying; write end ok=1 written=4\n')
            output = root / 'capture'
            # No live launcher references, profile, consoles or crash reports.
            with patch.object(collector.Path, 'home', return_value=root):
                collector.collect(profile, output)
            manifest = json.loads((output / 'manifest.json').read_text())
            self.assertEqual(manifest['crashWindowEpoch'], [-3400, 3800])
            entries = {entry['source']: entry for entry in manifest['files']}
            captured = entries[str(bridge)]
            self.assertTrue(captured['stable'])
            self.assertEqual((output / captured['copy']).read_text(), bridge.read_text())
            self.assertIn('error', entries[str(logs / 'game_200000.log')])
            self.assertIsNone(collector.game_log_epoch(Path('game_300000.log.bridge.log.old')))

    def test_exact_requests_exclude_templates_and_fixtures(self):
        self.assertEqual(collector.request_paths(
            '/tmp/yaagl-fps.XXXXXXXXXX /tmp/yaagl-owned-wine.XXXXXXXXXX '
            '/tmp/yaagl-fps.123456 /tmp/yaagl-fps.123456/response '
            '/tmp/yaagl-owned-wine.Abc123 /tmp/yaagl-bridge-fixture-Abc123 '
            '/tmp/yaagl-fps.123456-other /tmp/yaagl-launch.XXXXXXXXXX '
            '/tmp/yaagl-launch.Abc1234567/journal.json '
            '/tmp/yaagl-launch-fix.XXXXXXXXXX /tmp/yaagl-launch-fix.Def1234567/status.json '
            '/tmp/yaagl-launch-fix.Def1234567-not-a-request'),
            ['/tmp/yaagl-fps.123456', '/tmp/yaagl-launch-fix.Def1234567',
             '/tmp/yaagl-launch.Abc1234567', '/tmp/yaagl-owned-wine.Abc123'])

    def test_preserves_deployed_build_separately_from_checkout(self):
        with tempfile.TemporaryDirectory(prefix='yaagl-evidence-test-') as name:
            root = Path(name).resolve()
            profile = root / 'profile'
            manifests = profile / 'manifests'
            manifests.mkdir(parents=True)
            build = manifests / 'build.json'
            build.write_text('{"sourceCommit":"older-deployed-build"}')
            config = profile / 'neutralino.config.json'
            config.write_text('{"modes":{"window":{"title":"Yaagl OS"}}}')
            output = root / 'capture'
            with patch.object(collector.Path, 'home', return_value=root):
                collector.collect(profile, output)
            capture = json.loads((output / 'manifest.json').read_text())
            entries = {entry['source']: entry for entry in capture['files']}
            for original in [build, config]:
                self.assertTrue(entries[str(original)]['stable'])
                self.assertEqual((output / entries[str(original)]['copy']).read_bytes(), original.read_bytes())

    def test_copy_preserves_sources_and_records_symlink_and_missing(self):
        with tempfile.TemporaryDirectory(prefix='yaagl-evidence-test-') as name:
            root = Path(name)
            source = root / 'source'
            source.mkdir()
            log = source / 'output.log'
            log.write_bytes(b'full\x00log\n')
            before = log.stat()
            (source / 'link').symlink_to(log)
            out = root / 'out'
            out.mkdir()
            capture = collector.Capture(out)
            capture.tree(source)
            capture.copy(source / 'absent')
            entry = capture.entries[str(log)]
            self.assertTrue(entry['stable'])
            self.assertEqual((out / entry['copy']).read_bytes(), b'full\x00log\n')
            self.assertEqual(log.stat().st_mtime_ns, before.st_mtime_ns)
            self.assertFalse(capture.entries[str(source / 'link')]['copied'])
            self.assertIn('error', capture.entries[str(source / 'absent')])
            # Repeated capture must not overwrite already preserved evidence.
            log.write_text('later')
            capture.copy(log)
            self.assertEqual((out / entry['copy']).read_bytes(), b'full\x00log\n')

    def test_reject_output_in_profile_or_existing(self):
        with tempfile.TemporaryDirectory(prefix='yaagl-evidence-test-') as name:
            profile = Path(name) / 'profile'
            profile.mkdir()
            with self.assertRaises(ValueError):
                collector.collect(profile, profile / 'evidence')
            with self.assertRaises(FileExistsError):
                collector.collect(profile, Path(name))

    def test_explicit_run_keeps_all_streams_without_substituting_newer_run(self):
        with tempfile.TemporaryDirectory(prefix='yaagl-evidence-test-') as name:
            root = Path(name).resolve()
            profile = root / 'profile'
            logs = profile / 'logs'
            logs.mkdir(parents=True)
            (profile / 'neutralinojs.log').write_text('full launcher history')
            (logs / 'game_100000.log.bridge.log').write_text('selected bridge')
            (logs / 'game_200000.log.wine.log').write_text('different run')
            with patch.object(collector.Path, 'home', return_value=root):
                collector.collect(profile, root / 'capture', run_log='game_100000.log')
            result = json.loads((root / 'capture/manifest.json').read_text())
            entries = {entry['source']: entry for entry in result['files']}
            self.assertEqual(result['runLog'], 'game_100000.log')
            self.assertEqual(result['crashWindowEpoch'], [-3500, 3700])
            self.assertTrue(entries[str(logs / 'game_100000.log.bridge.log')]['copied'])
            self.assertTrue(entries[str(profile / 'neutralinojs.log')]['copied'])
            for suffix in ('', '.wine.log', '.steam.log'):
                self.assertIn('error', entries[str(logs / ('game_100000.log' + suffix))])
            self.assertNotIn(str(logs / 'game_200000.log.wine.log'), entries)
            for invalid in ('../game_100000.log', 'game_100000.log*', 'game_100000.log.wine.log'):
                with self.assertRaises(ValueError):
                    collector.collect(profile, root / 'bad', run_log=invalid)
            self.assertFalse((root / 'bad').exists())


if __name__ == '__main__':
    unittest.main()
