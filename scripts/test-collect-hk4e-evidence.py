#!/usr/bin/env python3
"""Harmless filesystem regressions for evidence preservation."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('collector', Path(__file__).with_name('collect-hk4e-launch-evidence.py'))
collector = importlib.util.module_from_spec(spec)
spec.loader.exec_module(collector)


class EvidenceTest(unittest.TestCase):
    def test_unix_only_run_supersedes_older_disabled_log(self):
        paths = [Path('game_100000.log'), Path('game_200000.log.wine.log'),
                 Path('game_200000.log.steam.log'), Path('game_300000.log.old')]
        epochs = [epoch for p in paths if (epoch := collector.game_log_epoch(p)) is not None]
        self.assertEqual(max(epochs), 200)
        self.assertIsNone(collector.game_log_epoch(Path('game_invalid.log.wine.log')))

    def test_exact_requests_exclude_templates_and_fixtures(self):
        self.assertEqual(collector.request_paths(
            '/tmp/yaagl-fps.XXXXXXXXXX /tmp/yaagl-owned-wine.XXXXXXXXXX '
            '/tmp/yaagl-fps.123456 /tmp/yaagl-fps.123456/response '
            '/tmp/yaagl-owned-wine.Abc123 /tmp/yaagl-bridge-fixture-Abc123 '
            '/tmp/yaagl-fps.123456-other /tmp/yaagl-launch.XXXXXXXXXX '
            '/tmp/yaagl-launch.Abc1234567/journal.json'),
            ['/tmp/yaagl-fps.123456', '/tmp/yaagl-launch.Abc1234567', '/tmp/yaagl-owned-wine.Abc123'])

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


if __name__ == '__main__':
    unittest.main()
