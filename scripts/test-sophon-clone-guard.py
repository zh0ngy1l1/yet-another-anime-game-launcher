#!/usr/bin/env python3
"""Synthetic safety checks; never invokes a server or a game operation."""
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

import sophon_clone_guard as module


class GuardTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name).resolve()
        self.original = self.root / 'original'
        self.clone = self.root / 'clone'
        self.original.mkdir()
        self.clone.mkdir()
        (self.original / 'source.bin').write_bytes(b'unchanged original')

    def tearDown(self):
        self.temp.cleanup()

    def test_differently_named_hardlink_rejected(self):
        (self.clone / 'different').mkdir()
        os.link(self.original / 'source.bin', self.clone / 'different/renamed.bin')
        with self.assertRaisesRegex(ValueError, 'shares an inode'):
            module.guard_clone(self.original, self.clone)

    def test_development_cli_rejects_renamed_hardlink_before_loading_service(self):
        (self.clone / 'different').mkdir()
        os.link(self.original / 'source.bin', self.clone / 'different/renamed.bin')
        result = subprocess.run([
            sys.executable, str(Path(__file__).with_name('sophon-update.py')),
            '--gamedir', str(self.clone), '--clone-of', str(self.original),
            '--cache', str(self.root / 'cache'),
        ], capture_output=True, text=True, timeout=10)
        self.assertEqual(result.returncode, 2)
        self.assertIn('shares an inode', result.stderr)

    def test_same_relative_name_hardlink_rejected(self):
        os.link(self.original / 'source.bin', self.clone / 'source.bin')
        with self.assertRaisesRegex(ValueError, 'shares an inode'):
            module.guard_clone(self.original, self.clone)

    def test_independent_copy_accepted(self):
        shutil.copy2(self.original / 'source.bin', self.clone / 'source.bin')
        _, _, original, clone = module.guard_clone(self.original, self.clone)
        self.assertEqual(len(original), 2)
        self.assertEqual(len(clone), 2)

    def test_nested_roots_and_aliases_rejected(self):
        nested = self.original / 'nested'
        nested.mkdir()
        alias = self.root / 'alias'
        alias.symlink_to(self.original, target_is_directory=True)
        for candidate in (self.original, nested, alias):
            with self.subTest(path=candidate.name), self.assertRaisesRegex(ValueError, 'disjoint'):
                module.guard_clone(self.original, candidate)

    def test_clone_symlink_rejected(self):
        (self.clone / 'linked.bin').symlink_to(self.original / 'source.bin')
        with self.assertRaisesRegex(ValueError, 'symlink'):
            module.guard_clone(self.original, self.clone)

    def cli_with_import_guard(self, *options):
        code = '''
import importlib.abc, pathlib, runpy, sys
class RejectServiceImport(importlib.abc.MetaPathFinder):
    def find_spec(self, fullname, path, target=None):
        if fullname == 'sophon_full':
            raise RuntimeError('SERVICE_IMPORT_REACHED')
sys.meta_path.insert(0, RejectServiceImport())
sys.path.insert(0, str(pathlib.Path(sys.argv[1]).parent))
sys.argv = sys.argv[1:]
runpy.run_path(sys.argv[0], run_name='__main__')
'''
        return subprocess.run([
            sys.executable, '-c', code, str(Path(__file__).with_name('sophon-update.py')),
            '--gamedir', str(self.clone), '--cache', str(self.root / 'cache'),
            *map(str, options),
        ], capture_output=True, text=True, timeout=10)

    def assert_auxiliary_rejected(self, result, option):
        self.assertEqual(result.returncode, 2)
        self.assertIn(option + ' must be outside', result.stderr)
        self.assertNotIn('SERVICE_IMPORT_REACHED', result.stderr)

    def test_clone_cli_rejects_auxiliary_paths_in_original_or_target(self):
        for directory in (self.original, self.clone):
            for option in ('--cache', '--result'):
                with self.subTest(root=directory.name, option=option):
                    result = self.cli_with_import_guard('--clone-of', self.original,
                                                        option, directory / 'auxiliary')
                    self.assert_auxiliary_rejected(result, option)

    def test_verify_only_cli_rejects_auxiliary_paths_in_game_directory(self):
        for option in ('--cache', '--result'):
            with self.subTest(option=option):
                result = self.cli_with_import_guard('--verify-only', option, self.clone / 'auxiliary')
                self.assert_auxiliary_rejected(result, option)

    def test_auxiliary_symlink_aliases_are_resolved_before_validation(self):
        alias = self.root / 'alias'
        alias.symlink_to(self.clone, target_is_directory=True)
        for option in ('--cache', '--result'):
            with self.subTest(option=option):
                result = self.cli_with_import_guard('--verify-only', option, alias / 'auxiliary')
                self.assert_auxiliary_rejected(result, option)

    def test_cli_accepts_external_auxiliary_paths_in_both_modes(self):
        for mode in [('--verify-only',), ('--clone-of', self.original)]:
            with self.subTest(mode=mode):
                result = self.cli_with_import_guard(*mode, '--result', self.root / 'result.json')
                self.assertEqual(result.returncode, 1)
                self.assertIn('SERVICE_IMPORT_REACHED', result.stderr)

    def test_external_result_hardlink_does_not_truncate_original(self):
        result = self.root / 'result.json'
        os.link(self.original / 'source.bin', result)
        module.write_json_result(result, {'verified': True})
        self.assertEqual((self.original / 'source.bin').read_bytes(), b'unchanged original')
        self.assertFalse(result.samefile(self.original / 'source.bin'))


if __name__ == '__main__':
    unittest.main()
