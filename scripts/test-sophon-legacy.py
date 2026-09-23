#!/usr/bin/env python3
"""Install/repair adapter and isolated legacy patch regression fixtures."""
import base64
from concurrent.futures import ThreadPoolExecutor
import hashlib
import io
import os
from pathlib import Path
import sys
import tempfile
import threading
import unittest
from unittest.mock import patch
from urllib.error import URLError

import xxhash
import zstandard

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "sophon_server"))
import sophon_api as api
import manifest_pb2
import manifest_ldiff_pb2


def md5(value):
    return hashlib.md5(value).hexdigest()


# Generated from these small authored strings using sisong/HDiffPatch hdiffz,
# commit 3b9dca715ca492873bf2c49e22e5d5b7d2a78620, `hdiffz -m old new patch`.
# No third-party source code is embedded in these binary test fixtures.
OLD = b"The old launcher fixture.\n"
NEW = b"The new launcher fixture with verified bytes.\n"
HDIFF = base64.b64decode("SERJRkYxMyYALhoBAwACAAAAHQAHBxEgLVRoZSBuZXcgd2l0aCB2ZXJpZmllZCBieXRlcy4K")
EMPTY_HDIFF = base64.b64decode("SERJRkYxMyYALgAAAAACAAAALgAgLVRoZSBuZXcgbGF1bmNoZXIgZml4dHVyZSB3aXRoIHZlcmlmaWVkIGJ5dGVzLgo=")


class LegacyAdapterTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="yaagl-legacy-test-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()
        self.config = b"[General]\ngame_version=1.0.0\n"
        (self.root / "config.ini").write_bytes(self.config)
        options = api.Options()
        options.gamedir = self.root
        options.tempdir = self.root / ".tmp"
        options.tempdir.mkdir()
        self.addCleanup(patch.stopall)
        patch.object(api, "OPT", options).start()
        patch.object(api, "RUN_MEMORY_HACK", False).start()
        self.client = api.SophonClient()
        self.client.installed_ver = "1.0.0"
        self.client.rel_type = "os"
        self.client.di_chunks.getBuild_json = {"data": {"tag": "1.0.0"}}
        self.client.di_chunks.category_json = {
            "matching_field": "game", "chunk_download": {
                "url_prefix": "https://example.invalid/chunks", "compression": 1}}
        self.payloads = {}
        self.calls = []

    def file_info(self, name, content):
        payload = zstandard.ZstdCompressor().compress(content)
        identity = xxhash.xxh64(payload).hexdigest() + "_" + md5(payload)
        self.payloads[identity] = payload
        result = manifest_pb2.FileInfo(filename=name, size=len(content), md5=md5(content))
        result.chunks.add(chunk_id=identity, md5=md5(content), offset=0,
                          compressed_size=len(payload), uncompressed_size=len(content),
                          compressed_md5=md5(payload))
        return result

    def fetch(self, chunk, path):
        self.calls.append(chunk.id)
        path.write_bytes(self.payloads[chunk.id])

    def test_clients_do_not_share_metadata_or_pending_queues(self):
        other = api.SophonClient()
        self.client.new_files_to_download.add("one")
        self.client.ldiff_files_to_remove.add("patch")
        self.client.di_diffs.getBuild_json = {"anything": "value"}
        self.assertEqual(other.new_files_to_download, set())
        self.assertEqual(other.ldiff_files_to_remove, set())
        self.assertIsNone(other.di_diffs.getBuild_json)
        self.assertIsNot(other.di_chunks, self.client.di_chunks)

    def test_same_size_hash_mismatch_is_actually_replaced(self):
        info = self.file_info("GenshinImpact.exe", b"good")
        target = self.root / info.filename
        target.write_bytes(b"oops")
        self.client.new_files_to_download.add(info.filename)
        with patch.object(api.Transport, "chunk", side_effect=self.fetch):
            self.assertTrue(self.client.download_game_file(info))
        self.assertEqual(target.read_bytes(), b"good")
        self.assertEqual(len(self.calls), 1)
        self.assertEqual((self.root / "config.ini").read_bytes(), self.config)

    def test_reliable_repair_detects_and_fixes_same_size_corruption(self):
        info = self.file_info("GenshinImpact.exe", b"good")
        (self.root / info.filename).write_bytes(b"oops")
        self.client.di_chunks.manifest = manifest_pb2.Manifest(files=[info])
        api.OPT.repair_mode = "reliable"
        with patch.object(self.client, "load_manifest"), patch.object(api.Transport, "chunk", side_effect=self.fetch):
            self.client.repair_by_category("game")
        self.assertEqual((self.root / info.filename).read_bytes(), b"good")
        self.assertEqual(len(self.calls), 1)
        self.assertEqual((self.root / "config.ini").read_bytes(), self.config)

    def test_concurrent_same_basename_downloads_cannot_collide(self):
        files = [self.file_info("one/VFS.bytes", b"one asset"),
                 self.file_info("two/VFS.bytes", b"two asset")]
        barrier = threading.Barrier(2)
        def concurrent_fetch(chunk, path):
            barrier.wait(timeout=5)
            self.fetch(chunk, path)
        with patch.object(api.Transport, "chunk", side_effect=concurrent_fetch), ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(self.client.download_game_file, files))
        self.assertEqual(results, [True, True])
        self.assertEqual((self.root / files[0].filename).read_bytes(), b"one asset")
        self.assertEqual((self.root / files[1].filename).read_bytes(), b"two asset")

    def test_same_size_existing_valid_file_is_skipped_after_hash_check(self):
        info = self.file_info("file", b"correct")
        (self.root / "file").write_bytes(b"correct")
        with patch.object(api.Transport, "chunk", side_effect=AssertionError("network should not be used")):
            self.assertTrue(self.client.download_game_file(info))

    def test_bad_download_preserves_original(self):
        info = self.file_info("GenshinImpact.exe", b"target")
        (self.root / info.filename).write_bytes(b"old exe")
        self.payloads[info.chunks[0].chunk_id] = b"bad"
        with patch.object(api.Transport, "chunk", side_effect=self.fetch), self.assertRaises(ValueError):
            self.client.download_game_file(info)
        self.assertEqual((self.root / info.filename).read_bytes(), b"old exe")
        self.assertEqual((self.root / "config.ini").read_bytes(), self.config)

    def test_cancelled_adapter_raises_instead_of_reporting_success(self):
        info = self.file_info("GenshinImpact.exe", b"target")
        (self.root / info.filename).write_bytes(b"old exe")
        cancel = threading.Event()
        cancel.set()
        with self.assertRaises(api.Cancelled if hasattr(api, "Cancelled") else RuntimeError):
            self.client.download_game_file(info, cancel_event=cancel)
        self.assertEqual((self.root / info.filename).read_bytes(), b"old exe")

    def test_directory_entry_creates_directory(self):
        info = manifest_pb2.FileInfo(filename="empty-directory", flags=64)
        self.client.download_game_file(info)
        self.assertTrue((self.root / info.filename).is_dir())

    def test_paths_and_symlinks_rejected_before_download(self):
        outside = self.root / "outside"
        outside.mkdir()
        (self.root / "link").symlink_to(outside, target_is_directory=True)
        for name in ("../escape", "C:/escape", "link/escape"):
            with self.subTest(name=name), self.assertRaises(ValueError):
                self.client.download_game_file(self.file_info(name, b"evil"))
        self.assertEqual(list(outside.iterdir()), [])

    def test_branch_password_is_never_saved_in_json_cache(self):
        self.client.game_type = "hk4e"
        self.client.branch = "main"
        branch = {"tag": "1.0.0", "branch": "main", "package_id": "dummy",
                  "password": "test-only-placeholder"}
        with patch.object(api.Transport, "json", return_value={"game_branches": [{"main": branch}]}):
            self.client.retrieve_API_keys()
        self.assertEqual(self.client.branches_json, branch)
        self.assertEqual(list(api.OPT.tempdir.iterdir()), [])

    def test_api_transport_errors_hide_secret_bearing_url(self):
        with patch.object(api.request, "urlopen", side_effect=URLError("https://example.invalid/?password=test-only-placeholder")):
            with self.assertRaises(api.ServiceError) as raised:
                self.client.load_cached_api_file("metadata.json", "https://example.invalid/?password=test-only-placeholder")
        self.assertNotIn("placeholder", str(raised.exception))
        self.assertNotIn("https://", str(raised.exception))
        self.assertEqual(list(api.OPT.tempdir.iterdir()), [])

    def test_interrupted_metadata_transfer_preserves_old_cache(self):
        cached = api.OPT.tempdir / "metadata.json"
        cached.write_bytes(b"old cache")
        os.utime(cached, (1, 1))
        class Interrupted(io.BytesIO):
            def read(self, size=-1):
                if self.tell():
                    raise OSError("connection lost")
                return super().read(size)
        with patch.object(api.Transport, "open", return_value=Interrupted(b"partial")):
            with self.assertRaises(api.ServiceError):
                self.client.load_cached_api_file("metadata.json", "https://example.invalid")
        self.assertEqual(cached.read_bytes(), b"old cache")
        self.assertEqual(list(api.OPT.tempdir.glob("*.part-*")), [])


class LegacyPatchTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="yaagl-patch-test-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()
        self.old = self.root / "old"
        self.old.write_bytes(OLD)
        self.target = self.root / "target"
        self.patch = self.root / "patch"
        self.addCleanup(patch.stopall)
        patch.object(api, "HPATCHZ_APP", ROOT / "sidecar/hpatchz/hpatchz").start()

    def test_raw_copy_over_section_is_copied_without_hpatchz(self):
        self.patch.write_bytes(b"prefix" + NEW + b"suffix")
        with patch.object(api.subprocess, "Popen", side_effect=AssertionError("raw Copy-Over must not invoke hpatchz")):
            self.assertTrue(api.hpatchz_patch_file(self.old, self.target, self.patch, 6, len(NEW),
                                                 allow_copy_over=True, expected_size=len(NEW)))
        self.assertEqual(self.target.read_bytes(), NEW)
        self.assertEqual(self.old.read_bytes(), OLD)

    def test_unknown_payload_with_nonempty_source_is_rejected(self):
        self.patch.write_bytes(NEW)
        with self.assertRaises(ValueError):
            api.hpatchz_patch_file(self.old, self.target, self.patch, 0, len(NEW))
        self.assertFalse(self.target.exists())

    def test_raw_payload_wrong_length_and_truncated_section_are_rejected(self):
        self.patch.write_bytes(NEW)
        for length, expected in ((len(NEW), len(NEW) + 1), (len(NEW) + 1, len(NEW) + 1)):
            with self.subTest(length=length), self.assertRaises(ValueError):
                api.hpatchz_patch_file(self.old, self.target, self.patch, 0, length,
                                      allow_copy_over=True, expected_size=expected)

    @unittest.skipUnless(sys.platform == "darwin" and (ROOT / "sidecar/hpatchz/hpatchz").is_file(),
                         "Real bundled hpatchz requires macOS")
    def test_real_hdiff_patch_section(self):
        self.patch.write_bytes(b"prefix" + HDIFF + b"suffix")
        self.assertTrue(api.hpatchz_patch_file(self.old, self.target, self.patch, 6, len(HDIFF)))
        self.assertEqual(self.target.read_bytes(), NEW)
        self.assertEqual(self.old.read_bytes(), OLD)

    @unittest.skipUnless(sys.platform == "darwin" and (ROOT / "sidecar/hpatchz/hpatchz").is_file(),
                         "Real bundled hpatchz requires macOS")
    def test_copy_over_metadata_with_actual_hdiff_uses_empty_source(self):
        self.patch.write_bytes(EMPTY_HDIFF)
        self.assertTrue(api.hpatchz_patch_file(self.old, self.target, self.patch, 0, len(EMPTY_HDIFF),
                                             allow_copy_over=True, expected_size=len(NEW)))
        self.assertEqual(self.target.read_bytes(), NEW)

    def test_legacy_checksum_failure_never_replaces_original(self):
        options = api.Options()
        options.gamedir = self.root
        options.tempdir = self.root / ".tmp"
        options.tempdir.mkdir()
        patch.object(api, "OPT", options).start()
        client = api.SophonClient()
        client.installed_ver = "1.0.0"
        self.target.write_bytes(OLD)
        self.patch.write_bytes(NEW)
        info = manifest_ldiff_pb2.DiffFileInfo(filename="target", size=len(NEW), hash="0" * 32)
        info.patches.add(key="1.0.0").info.CopyFrom(manifest_ldiff_pb2.PatchInfo(
            patch_id="patch", patch_offset=0, patch_length=len(NEW), patch_size=len(NEW)))
        client._apply_ldiff_file(self.root, info)
        self.assertEqual(self.target.read_bytes(), OLD)
        self.assertIn("target", client.new_files_to_download)


if __name__ == "__main__":
    unittest.main()
