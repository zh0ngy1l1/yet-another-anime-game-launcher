#!/usr/bin/env python3
"""Synthetic CLI tests for independent verification; no real game paths."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

SCRIPT = Path(__file__).with_name("verify-sophon-clone.py")
spec = importlib.util.spec_from_file_location("independent_verifier", SCRIPT)
verifier = importlib.util.module_from_spec(spec)
spec.loader.exec_module(verifier)


class CloneVerifierTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.proto_temp = tempfile.TemporaryDirectory(prefix="yaagl-verifier-proto-test-")
        cls.module = verifier.protobuf_module(Path(cls.proto_temp.name))

    @classmethod
    def tearDownClass(cls):
        cls.proto_temp.cleanup()

    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="yaagl-verifier-fixture-")
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name).resolve()
        self.original = self.root / "original"
        self.original.mkdir()
        (self.original / "Game_Data").mkdir()
        (self.original / "config.ini").write_text("[General]\ngame_version=1.2.3\n")
        old = {"Game_Data/globalgamemanagers": b"prefix\x001.2.3_123_456\x00suffix",
               "data.bin": b"old", "obsolete.bin": b"obsolete"}
        for name, value in old.items():
            (self.original / name).write_bytes(value)
        self.clone = self.root / "clone"
        shutil.copytree(self.original, self.clone)
        self.target = {"Game_Data/globalgamemanagers": b"prefix\x002.3.4_123_456\x00suffix",
                       "data.bin": b"new"}
        for name, value in self.target.items():
            (self.clone / name).write_bytes(value)
        (self.clone / "config.ini").write_text("[General]\ngame_version=2.3.4\n")
        (self.clone / "obsolete.bin").unlink()
        self.manifests = self.root / "manifests"
        self.manifests.mkdir()
        self.write_manifest("source", "1.2.3", old)
        self.write_manifest("target", "2.3.4", self.target)
        self.inventory = self.root / "original-inventory.json"
        self.inventory.write_text(json.dumps(verifier.inventory(self.original)))
        self.hashes = self.root / "original-hashes.json"
        self.hashes.write_text(json.dumps({"algorithm": "sha256", "files": {
            "config.ini": verifier.digest(self.original / "config.ini", "sha256")}}))
        self.result = self.root / "result.json"

    def write_manifest(self, kind, version, files):
        manifest = self.module.Manifest()
        for name, value in files.items():
            item = manifest.files.add()
            item.filename = name
            item.size = len(value)
            item.md5 = hashlib.md5(value).hexdigest()
        raw = manifest.SerializeToString()
        (self.manifests / f"{kind}-game.pb").write_bytes(raw)
        (self.manifests / f"{kind}.json").write_text(json.dumps({"retcode": 0, "data": {
            "tag": version, "manifests": [{"matching_field": "game", "manifest": {
                "uncompressed_size": str(len(raw)), "checksum": hashlib.md5(raw).hexdigest()}}]}}))

    def command(self):
        return [sys.executable, str(SCRIPT), "--clone", str(self.clone),
                "--original", str(self.original), "--manifest-dir", str(self.manifests),
                "--original-inventory", str(self.inventory), "--original-hashes", str(self.hashes),
                "--categories", "game", "--result", str(self.result)]

    def run_verifier(self):
        return subprocess.run(self.command(), text=True, capture_output=True)

    def test_valid_clone_passes_without_writing_either_installation(self):
        before = (verifier.inventory(self.original), verifier.inventory(self.clone))
        response = self.run_verifier()
        self.assertEqual(response.returncode, 0, response.stderr)
        report = json.loads(self.result.read_text())
        self.assertTrue(report["success"])
        self.assertEqual(report["verified_files"], 2)
        self.assertEqual(report["target_version"], "2.3.4")
        self.assertEqual(report["source_version"], "1.2.3")
        self.assertTrue(report["original_anchor_hashes_unchanged"]["config.ini"])
        self.assertEqual(before, (verifier.inventory(self.original), verifier.inventory(self.clone)))

    def test_same_size_corruption_fails(self):
        (self.clone / "data.bin").write_bytes(b"bad")
        self.assertEqual(self.run_verifier().returncode, 1)
        self.assertEqual(json.loads(self.result.read_text())["failures"][0]["status"], "wrong_md5")

    def test_stale_obsolete_asset_fails(self):
        (self.clone / "obsolete.bin").write_bytes(b"obsolete")
        self.assertEqual(self.run_verifier().returncode, 1)
        self.assertEqual(json.loads(self.result.read_text())["obsolete_files_present"], ["obsolete.bin"])

    def test_missing_source_manifest_cannot_claim_complete_audit_success(self):
        (self.manifests / "source.json").unlink()
        (self.clone / "obsolete.bin").write_bytes(b"obsolete")
        self.assertEqual(self.run_verifier().returncode, 1)
        report = json.loads(self.result.read_text())
        self.assertFalse(report["success"])
        self.assertFalse(report["obsolete_check_has_source_manifest"])
        self.assertEqual(report["verified_files"], 2)

    def test_hardlink_under_different_clone_path_is_rejected(self):
        os.link(self.original / "data.bin", self.clone / "different-name.bin")
        self.assertEqual(self.run_verifier().returncode, 1)
        report = json.loads(self.result.read_text())
        self.assertFalse(report["success"])
        self.assertEqual(report["shared_file_inodes"], ["different-name.bin"])
        self.assertTrue(report["original_inventory_unchanged"])

    def test_changed_original_fails(self):
        (self.original / "config.ini").write_text("[General]\ngame_version=9.9.9\n")
        self.assertEqual(self.run_verifier().returncode, 1)
        self.assertFalse(json.loads(self.result.read_text())["original_inventory_unchanged"])

    def test_manifest_traversal_rejected(self):
        self.write_manifest("target", "2.3.4", {"../outside": b"unsafe"})
        self.assertEqual(self.run_verifier().returncode, 2)
        self.assertFalse(self.result.exists())

    def test_result_inside_clone_rejected(self):
        self.result = self.clone / "result.json"
        self.assertEqual(self.run_verifier().returncode, 2)
        self.assertFalse(self.result.exists())


if __name__ == "__main__":
    unittest.main()
