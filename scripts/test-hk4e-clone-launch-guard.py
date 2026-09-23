#!/usr/bin/env python3
import importlib.util
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('launch_guard', Path(__file__).with_name('guard-hk4e-clone-launch.py'))
guard = importlib.util.module_from_spec(spec)
spec.loader.exec_module(guard)


class GuardTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()
        self.original, self.clone, self.profile = [self.root / n for n in ('original', 'clone', 'profile')]
        for p in (self.original, self.clone, self.profile):
            p.mkdir()
        (self.profile / '.storage').mkdir()
        self.setting = self.profile / '.storage/game_install_dir.neustorage'
        self.setting.write_text(str(self.clone))

    def check(self, evidence=None):
        return guard.validate(self.original, self.clone, self.profile, evidence or self.root / 'evidence', [])

    def test_valid_isolation(self):
        self.assertEqual(self.check()[1], self.clone)

    def test_original_setting_aborts(self):
        self.setting.write_text(str(self.original))
        with self.assertRaises(ValueError):
            self.check()

    def test_original_alias_aborts(self):
        alias = self.root / 'alias'
        alias.symlink_to(self.original)
        self.setting.write_text(str(alias))
        with self.assertRaises(ValueError):
            self.check()

    def test_evidence_cannot_write_game(self):
        with self.assertRaises(ValueError):
            self.check(self.original / 'evidence')

    def test_protected_profile_aborts(self):
        with self.assertRaises(ValueError):
            guard.validate(self.original, self.clone, self.profile, self.root / 'evidence', [self.profile])

    def test_redaction(self):
        self.assertNotIn('sensitive', guard.redact('URL https://example.org/file?key=sensitive'))
        self.assertNotIn('sensitive', guard.redact('token=sensitive'))
        self.assertNotIn('sensitive', guard.redact('{"token":"sensitive"}'))
        self.assertNotIn('a' * 64, guard.redact('request=' + 'a' * 64))

    @unittest.skipUnless(sys.platform == 'darwin', 'macOS Seatbelt required')
    def test_os_denies_child_write_through_alias(self):
        f = self.original / 'sentinel'
        f.write_text('unchanged')
        alias = self.root / 'alias'
        alias.symlink_to(self.original)
        result = subprocess.run(['/usr/bin/sandbox-exec', '-p', guard.policy_for(self.original, []),
                                 '/bin/sh', '-c', 'printf changed > "$1"', 'guard-test', str(alias / 'sentinel')],
                                capture_output=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(f.read_text(), 'unchanged')


if __name__ == '__main__':
    unittest.main()
