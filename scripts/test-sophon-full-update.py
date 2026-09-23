#!/usr/bin/env python3
"""Deterministic updater tests. All writes stay in temporary fixture directories."""
from dataclasses import replace
import errno
import hashlib
import json
from pathlib import Path
import sys
import tempfile
import threading
from types import SimpleNamespace
import unittest
from unittest.mock import patch

import xxhash
import zstandard

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "sophon_server"))
import full_update as engine
from full_update import Asset, Build, Cancelled, Chunk, Updater


def md5(data):
    return hashlib.md5(data).hexdigest()


class Fixture:
    """Official-shaped compressed identities with an entirely local transport."""
    def __init__(self):
        self.payloads = {}
        self.calls = []

    def asset(self, name, pieces, *, order=None, compressed=True, digest=None):
        chunks = []
        offset = 0
        for piece in pieces:
            payload = zstandard.ZstdCompressor().compress(piece) if compressed else piece
            identity = xxhash.xxh64(payload).hexdigest() + "_" + md5(payload)
            self.payloads[identity] = payload
            chunks.append(Chunk(identity, md5(piece), offset, len(piece), len(payload),
                                compressed=compressed))
            offset += len(piece)
        if order is not None:
            chunks = [chunks[i] for i in order]
        return Asset(name, offset, digest or md5(b"".join(pieces)), tuple(chunks))

    def fetch(self, chunk, destination):
        self.calls.append(chunk.id)
        destination.write_bytes(self.payloads[chunk.id])


class FullUpdateTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="yaagl-full-update-test-")
        self.addCleanup(self.temp.cleanup)
        # /tmp can be a symlink on macOS; the updater deliberately rejects it.
        self.root = Path(self.temp.name).resolve()
        self.original_config = b"[General]\r\ngame_version=1.0.0\r\ncps=mihoyo\r\n"
        (self.root / "config.ini").write_bytes(self.original_config)
        self.fixture = Fixture()

    def write(self, name, data):
        path = self.root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        return path

    def updater(self, target, source=(), **kwargs):
        target_build = target if isinstance(target, Build) else Build("2.0.0", tuple(target))
        source_build = (None if source is None else source if isinstance(source, Build)
                        else Build("1.0.0", tuple(source)))
        return Updater(self.root, target_build, source_build, self.fixture.fetch, **kwargs)

    def assert_version(self, version):
        self.assertIn(b"game_version=" + version.encode(), (self.root / "config.ini").read_bytes())

    def assert_original_config(self):
        self.assertEqual((self.root / "config.ini").read_bytes(), self.original_config)

    def test_completely_unchanged_file(self):
        asset = self.fixture.asset("GenshinImpact.exe", [b"unchanged"])
        path = self.write(asset.name, b"unchanged")
        inode = path.stat().st_ino
        updater = self.updater([asset], [asset])
        updater.run()
        self.assertEqual(path.stat().st_ino, inode)
        self.assertEqual(self.fixture.calls, [])
        self.assertEqual(updater.verify(), [])
        self.assert_version("2.0.0")

    def test_file_with_one_changed_chunk(self):
        source = self.fixture.asset("file", [b"same", b"old!"])
        target = self.fixture.asset("file", [b"same", b"new!"])
        self.write("file", b"sameold!")
        result = self.updater([target], [source]).run()
        self.assertEqual((self.root / "file").read_bytes(), b"samenew!")
        self.assertEqual(self.fixture.calls, [target.chunks[1].id])
        self.assertEqual(result["reused"], 4)

    def test_reuses_several_chunks_at_new_offsets_and_arbitrary_manifest_order(self):
        source = self.fixture.asset("file", [b"aaaa", b"bb", b"ccc"])
        target = self.fixture.asset("file", [b"ccc", b"aaaa", b"new", b"bb"], order=[3, 1, 0, 2])
        self.write("file", b"aaaabbccc")
        result = self.updater([target], [source]).run()
        self.assertEqual((self.root / "file").read_bytes(), b"cccaaaanewbb")
        self.assertEqual(self.fixture.calls, [target.chunks[3].id])
        self.assertEqual(result["reused"], 9)

    def test_duplicate_source_and_target_chunk_hashes(self):
        source = self.fixture.asset("file", [b"aa", b"aa", b"bb"])
        target = self.fixture.asset("file", [b"bb", b"aa", b"aa", b"aa"])
        self.write("file", b"aaaabb")
        self.updater([target], [source]).run()
        self.assertEqual((self.root / "file").read_bytes(), b"bbaaaaaa")
        self.assertEqual(self.fixture.calls, [])

    def test_duplicate_new_chunks_are_downloaded_once_per_asset(self):
        target = self.fixture.asset("file", [b"same", b"same"])
        self.updater([target]).run()
        self.assertEqual((self.root / "file").read_bytes(), b"samesame")
        self.assertEqual(self.fixture.calls, [target.chunks[0].id])

    def test_wholly_new_file_and_directory_and_empty_file(self):
        target = self.fixture.asset("new/data", [b"brand new"])
        empty = self.fixture.asset("new/empty", [])
        directory = Asset("explicit-empty-directory", 0, "", directory=True)
        updater = self.updater([target, empty, directory])
        updater.run()
        self.assertEqual((self.root / "new/data").read_bytes(), b"brand new")
        self.assertTrue((self.root / directory.name).is_dir())
        self.assertEqual((self.root / empty.name).stat().st_size, 0)
        self.assertEqual(updater.verify(), [])

    def test_same_basename_different_directories(self):
        a = self.fixture.asset("one/data.bin", [b"first"])
        b = self.fixture.asset("two/data.bin", [b"second"])
        self.updater([a, b]).run()
        self.assertEqual((self.root / a.name).read_bytes(), b"first")
        self.assertEqual((self.root / b.name).read_bytes(), b"second")

    def test_parallel_same_basename_shared_ids_are_isolated_and_network_is_bounded(self):
        first_pieces = [b"shared", b"first-1", b"first-2", b"first-3", b"shared", b"first-4"]
        second_pieces = [b"shared", b"second-1", b"second-2", b"second-3", b"shared", b"second-4"]
        first = self.fixture.asset("one/VFS.bytes", first_pieces)
        second = self.fixture.asset("two/VFS.bytes", second_pieces)
        initial_batch = threading.Barrier(8)
        counter_lock = threading.Lock()
        active = maximum = started = 0
        destinations = []
        def parallel_fetch(chunk, destination):
            nonlocal active, maximum, started
            with counter_lock:
                active += 1
                maximum = max(maximum, active)
                started += 1
                initial = started <= 8
                destinations.append(destination)
            try:
                if initial:
                    initial_batch.wait(timeout=5)
                self.fixture.fetch(chunk, destination)
            finally:
                with counter_lock:
                    active -= 1
        updater = self.updater([first, second], workers=100, chunk_workers=100)
        updater.fetch = parallel_fetch
        updater.run()
        self.assertEqual(maximum, 8)
        self.assertEqual(active, 0)
        self.assertEqual(len(destinations), len(set(destinations)))
        self.assertEqual(len(self.fixture.calls), 10)
        self.assertEqual(self.fixture.calls.count(first.chunks[0].id), 2)
        self.assertEqual((self.root / first.name).read_bytes(), b"".join(first_pieces))
        self.assertEqual((self.root / second.name).read_bytes(), b"".join(second_pieces))
        self.assertEqual(updater.verify(), [])

    def test_cancellation_with_eight_inflight_chunks_never_publishes(self):
        first = self.fixture.asset("GenshinImpact.exe", [b"a1", b"a2", b"a3", b"a4"])
        second = self.fixture.asset("second", [b"b1", b"b2", b"b3", b"b4"])
        self.write(first.name, b"old executable")
        self.write(second.name, b"old second")
        cancel = threading.Event()
        # The action executes before the barrier releases any downloader.
        all_inflight = threading.Barrier(8, action=cancel.set)
        counter_lock = threading.Lock()
        active = maximum = 0
        def cancelled_fetch(chunk, destination):
            nonlocal active, maximum
            with counter_lock:
                active += 1
                maximum = max(maximum, active)
            try:
                all_inflight.wait(timeout=5)
                self.fixture.fetch(chunk, destination)
            finally:
                with counter_lock:
                    active -= 1
        updater = self.updater([first, second], cancel=cancel, workers=2, chunk_workers=4)
        updater.fetch = cancelled_fetch
        with self.assertRaises(Cancelled):
            updater.run()
        self.assertEqual(maximum, 8)
        self.assertEqual(active, 0)
        self.assertEqual((self.root / first.name).read_bytes(), b"old executable")
        self.assertEqual((self.root / second.name).read_bytes(), b"old second")
        self.assert_original_config()
        self.assertEqual(list((self.root / engine.STATE_DIR).rglob("*.part*")), [])
        self.updater([first, second], workers=2, chunk_workers=4).run()
        self.assertEqual((self.root / first.name).read_bytes(), b"a1a2a3a4")
        self.assertEqual((self.root / second.name).read_bytes(), b"b1b2b3b4")
        self.assert_version("2.0.0")

    def test_bad_prefetched_chunk_preserves_originals_and_reuses_verified_peer_on_resume(self):
        first = self.fixture.asset("GenshinImpact.exe", [b"a1", b"a2", b"a3", b"a4"])
        second = self.fixture.asset("second", [b"b1", b"b2", b"b3", b"b4"])
        self.write(first.name, b"old executable")
        self.write(second.name, b"old second")
        obsolete = self.fixture.asset("obsolete", [b"old"])
        self.write(obsolete.name, b"old")
        all_inflight = threading.Barrier(8)
        def corrupt_fetch(chunk, destination):
            all_inflight.wait(timeout=5)
            self.fixture.fetch(chunk, destination)
            if chunk.id == first.chunks[0].id:
                payload = destination.read_bytes()
                destination.write_bytes(payload[:-1] + bytes([payload[-1] ^ 1]))
        updater = self.updater([first, second], [obsolete], workers=2, chunk_workers=4)
        updater.fetch = corrupt_fetch
        with self.assertRaisesRegex(ValueError, "Compressed chunk"):
            updater.run()
        self.assertEqual((self.root / first.name).read_bytes(), b"old executable")
        self.assertEqual((self.root / second.name).read_bytes(), b"old second")
        self.assertTrue((self.root / obsolete.name).exists())
        self.assert_original_config()
        self.assertEqual(len(self.fixture.calls), 8)
        resumed = self.updater([first, second], [obsolete], workers=2, chunk_workers=4)
        resumed.run()
        self.assertEqual(len(self.fixture.calls), 9)
        self.assertEqual(self.fixture.calls.count(first.chunks[0].id), 2)
        self.assertEqual(resumed.verify(), [])
        self.assertFalse((self.root / obsolete.name).exists())
        self.assert_version("2.0.0")

    def test_obsolete_file_removed_only_after_target_is_verified(self):
        old = self.fixture.asset("old.dat", [b"obsolete"])
        target = self.fixture.asset("GenshinImpact.exe", [b"replacement"])
        self.write(old.name, b"obsolete")
        self.write("user-screenshot.png", b"personal")
        checks = []
        def event(value):
            if value["stage"] == "deleting":
                checks.append((self.root / target.name).read_bytes())
                self.assert_original_config()
        self.updater([target], [old], event=event).run()
        self.assertEqual(checks, [b"replacement"])
        self.assertFalse((self.root / old.name).exists())
        self.assertEqual((self.root / "user-screenshot.png").read_bytes(), b"personal")
        quarantined = list((self.root / engine.STATE_DIR / "obsolete").iterdir())
        self.assertEqual([p.read_bytes() for p in quarantined], [b"obsolete"])

    def test_existing_target_file_is_skipped_even_with_old_source_manifest(self):
        source = self.fixture.asset("file", [b"old"])
        target = self.fixture.asset("file", [b"target"])
        path = self.write("file", b"target")
        inode = path.stat().st_ino
        self.updater([target], [source]).run()
        self.assertEqual(self.fixture.calls, [])
        self.assertEqual(path.stat().st_ino, inode)

    def test_wrong_source_hash_never_reuses_corrupt_chunk(self):
        source = self.fixture.asset("file", [b"same", b"old!"])
        target = self.fixture.asset("file", [b"same", b"new!"])
        self.write("file", b"oopsold!")
        self.updater([target], [source]).run()
        self.assertEqual((self.root / "file").read_bytes(), b"samenew!")
        self.assertEqual(self.fixture.calls, [c.id for c in target.chunks])

    def test_absent_source_manifest_falls_back_to_full_target(self):
        target = self.fixture.asset("GenshinImpact.exe", [b"target", b"content"])
        self.write(target.name, b"old installation")
        self.updater([target], None).run()
        self.assertEqual((self.root / target.name).read_bytes(), b"targetcontent")
        self.assertEqual(self.fixture.calls, [c.id for c in target.chunks])

    def test_full_fallback_still_reuses_valid_chunks_at_target_offsets(self):
        target = self.fixture.asset("file", [b"same", b"new!"])
        self.write("file", b"sameoops")
        self.updater([target], None).run()
        self.assertEqual(self.fixture.calls, [target.chunks[1].id])

    def test_raw_uncompressed_chunks(self):
        target = self.fixture.asset("file", [b"raw target bytes"], compressed=False)
        self.updater([target]).run()
        self.assertEqual((self.root / "file").read_bytes(), b"raw target bytes")

    def test_corrupt_compressed_chunk_preserves_executable_and_config(self):
        target = self.fixture.asset("GenshinImpact.exe", [b"target bytes"])
        self.write(target.name, b"working old exe")
        chunk = target.chunks[0]
        payload = self.fixture.payloads[chunk.id]
        self.fixture.payloads[chunk.id] = payload[:-1] + bytes([payload[-1] ^ 1])
        with self.assertRaisesRegex(ValueError, "Compressed chunk"):
            self.updater([target]).run()
        self.assertEqual((self.root / target.name).read_bytes(), b"working old exe")
        self.assert_original_config()

    def test_corrupt_decompressed_data_rejected(self):
        target = self.fixture.asset("GenshinImpact.exe", [b"incorrect"])
        chunk = replace(target.chunks[0], md5=md5(b"expected!"))
        target = replace(target, chunks=(chunk,), md5=md5(b"expected!"))
        self.write(target.name, b"working old exe")
        with self.assertRaisesRegex(ValueError, "Decompressed chunk"):
            self.updater([target]).run()
        self.assertEqual((self.root / target.name).read_bytes(), b"working old exe")
        self.assert_original_config()

    def test_explicit_compressed_md5_is_checked_with_opaque_chunk_id(self):
        target = self.fixture.asset("GenshinImpact.exe", [b"target bytes"])
        payload = self.fixture.payloads[target.chunks[0].id]
        chunk = replace(target.chunks[0], id="opaque-id", compressed_md5="0" * 32)
        self.fixture.payloads[chunk.id] = payload
        target = replace(target, chunks=(chunk,))
        self.write(target.name, b"old executable")
        with self.assertRaisesRegex(ValueError, "Compressed chunk"):
            self.updater([target]).run()
        self.assertEqual((self.root / target.name).read_bytes(), b"old executable")
        self.assert_original_config()
        target = replace(target, chunks=(replace(chunk, compressed_md5=md5(payload)),))
        self.updater([target]).run()
        self.assertEqual((self.root / target.name).read_bytes(), b"target bytes")

    def test_wrong_final_md5_does_not_publish_any_staged_file(self):
        first = self.fixture.asset("first", [b"valid target"])
        second = self.fixture.asset("GenshinImpact.exe", [b"bad final"], digest="0" * 32)
        obsolete = self.fixture.asset("obsolete", [b"old data"])
        self.write("first", b"old first")
        self.write(second.name, b"working old exe")
        self.write(obsolete.name, b"old data")
        with self.assertRaisesRegex(ValueError, "Final asset"):
            self.updater([first, second], [obsolete]).run()
        self.assertEqual((self.root / "first").read_bytes(), b"old first")
        self.assertEqual((self.root / second.name).read_bytes(), b"working old exe")
        self.assertTrue((self.root / obsolete.name).exists())
        self.assert_original_config()

    def test_truncated_download_is_rejected_and_retry_succeeds(self):
        target = self.fixture.asset("file", [b"complete target"])
        chunk = target.chunks[0]
        correct = self.fixture.payloads[chunk.id]
        self.fixture.payloads[chunk.id] = correct[:-1]
        with self.assertRaisesRegex(ValueError, "Compressed chunk"):
            self.updater([target]).run()
        self.assertFalse((self.root / "file").exists())
        self.assert_original_config()
        self.fixture.payloads[chunk.id] = correct
        self.updater([target]).run()
        self.assertEqual((self.root / "file").read_bytes(), b"complete target")

    def test_download_exception_leaves_only_old_executable(self):
        target = self.fixture.asset("GenshinImpact.exe", [b"complete target"])
        self.write(target.name, b"old exe")
        def interrupted(chunk, dest):
            dest.write_bytes(b"partial")
            raise ConnectionError("connection interrupted")
        updater = self.updater([target])
        updater.fetch = interrupted
        with self.assertRaises(ConnectionError):
            updater.run()
        self.assertEqual((self.root / target.name).read_bytes(), b"old exe")
        self.assert_original_config()
        self.assertEqual(list((self.root / engine.STATE_DIR).rglob("*.part*")), [])

    def test_cancelled_construction_and_resume_keeps_verified_staged_file(self):
        first = self.fixture.asset("first", [b"new first"])
        second = self.fixture.asset("GenshinImpact.exe", [b"new exe"])
        self.write(first.name, b"old first")
        self.write(second.name, b"old exe")
        cancel = threading.Event()
        def event(value):
            if value["stage"] == "assembling" and value["filename"] == second.name:
                cancel.set()
        with self.assertRaises(Cancelled):
            self.updater([first, second], cancel=cancel, event=event).run()
        self.assertEqual((self.root / first.name).read_bytes(), b"old first")
        self.assertEqual((self.root / second.name).read_bytes(), b"old exe")
        self.assert_original_config()
        self.assertEqual(self.fixture.calls, [first.chunks[0].id])
        result = self.updater([first, second]).run()
        self.assertEqual(self.fixture.calls, [first.chunks[0].id, second.chunks[0].id])
        self.assertEqual(result["verified_files"], 2)
        self.assert_version("2.0.0")

    def test_resume_revalidates_corrupt_staged_file(self):
        first = self.fixture.asset("first", [b"new first"])
        second = self.fixture.asset("second", [b"new second"])
        cancel = threading.Event()
        def event(value):
            if value["stage"] == "assembling" and value["filename"] == second.name:
                cancel.set()
        with self.assertRaises(Cancelled):
            self.updater([first, second], cancel=cancel, event=event).run()
        staged = list((self.root / engine.STATE_DIR / "staged").iterdir())
        self.assertEqual(len(staged), 1)
        staged[0].write_bytes(b"bad first")
        self.updater([first, second]).run()
        self.assertEqual(self.fixture.calls.count(first.chunks[0].id), 2)
        self.assertEqual((self.root / first.name).read_bytes(), b"new first")

    def test_crash_during_publication_is_restartable(self):
        first = self.fixture.asset("GenshinImpact.exe", [b"new exe"])
        second = self.fixture.asset("second", [b"new second"])
        self.write(first.name, b"old exe")
        self.write(second.name, b"old second")
        real_replace = engine.os.replace
        def fail_second(source, dest):
            if Path(dest) == self.root / second.name:
                raise OSError(errno.EIO, "simulated power loss before replace")
            return real_replace(source, dest)
        with patch.object(engine.os, "replace", side_effect=fail_second), self.assertRaises(OSError):
            self.updater([first, second]).run()
        self.assertEqual((self.root / first.name).read_bytes(), b"new exe")
        self.assertEqual((self.root / second.name).read_bytes(), b"old second")
        self.assert_original_config()
        calls = list(self.fixture.calls)
        updater = self.updater([first, second])
        updater.run()
        self.assertEqual(self.fixture.calls, calls)
        self.assertEqual(updater.verify(), [])
        self.assert_version("2.0.0")

    def test_insufficient_space_does_not_delete_existing_data(self):
        target = self.fixture.asset("GenshinImpact.exe", [b"new exe"])
        obsolete = self.fixture.asset("old.dat", [b"old content"])
        self.write(target.name, b"old exe")
        self.write(obsolete.name, b"old content")
        with patch.object(engine.shutil, "disk_usage", return_value=SimpleNamespace(free=0)), self.assertRaises(OSError):
            self.updater([target], [obsolete]).run()
        self.assertEqual(self.fixture.calls, [])
        self.assertEqual((self.root / target.name).read_bytes(), b"old exe")
        self.assertTrue((self.root / obsolete.name).exists())
        self.assert_original_config()

    def test_enospc_during_fetch_keeps_old_file_and_resumes(self):
        target = self.fixture.asset("GenshinImpact.exe", [b"new exe"])
        self.write(target.name, b"old exe")
        updater = self.updater([target])
        def no_space(chunk, dest):
            dest.write_bytes(b"partial")
            raise OSError(errno.ENOSPC, "simulated full disk")
        updater.fetch = no_space
        with self.assertRaises(OSError):
            updater.run()
        self.assertEqual((self.root / target.name).read_bytes(), b"old exe")
        self.assert_original_config()
        self.updater([target]).run()
        self.assertEqual((self.root / target.name).read_bytes(), b"new exe")

    def test_predownload_never_changes_game_files_or_version_then_update_reuses_cache(self):
        source = self.fixture.asset("GenshinImpact.exe", [b"same", b"old!"])
        target = self.fixture.asset("GenshinImpact.exe", [b"same", b"new!"])
        obsolete = self.fixture.asset("old.dat", [b"old content"])
        self.write(source.name, b"sameold!")
        self.write(obsolete.name, b"old content")
        result = self.updater([target], [source, obsolete]).run(predownload=True)
        self.assertTrue(result["predownload"])
        self.assertEqual((self.root / source.name).read_bytes(), b"sameold!")
        self.assertTrue((self.root / obsolete.name).exists())
        self.assert_original_config()
        calls = list(self.fixture.calls)
        self.updater([target], [source, obsolete]).run()
        self.assertEqual(self.fixture.calls, calls)
        self.assertEqual((self.root / source.name).read_bytes(), b"samenew!")
        self.assertFalse((self.root / obsolete.name).exists())

    def test_invalid_remote_paths_are_rejected_before_game_writes(self):
        for name in ("../escape", "/absolute", "a/../file", "C:/file", "C:file", "a\\file",
                     "./file", "a//file", "a/", ".sophon-update/owned", ".tmp/file", "config.ini", "x\0y"):
            with self.subTest(name=name), self.assertRaises(ValueError):
                self.updater([self.fixture.asset(name, [b"payload"])])
        self.assertEqual(self.fixture.calls, [])
        self.assert_original_config()

    def test_symlink_parent_and_final_file_are_rejected(self):
        real = self.root / "outside"
        real.mkdir()
        self.write("outside/owned", b"untouched")
        (self.root / "link").symlink_to(real, target_is_directory=True)
        for name in ("link/owned", "link/new"):
            with self.subTest(name=name), self.assertRaises(ValueError):
                self.updater([self.fixture.asset(name, [b"evil"])]).run()
        (self.root / "file-link").symlink_to(real / "owned")
        with self.assertRaises(ValueError):
            self.updater([self.fixture.asset("file-link", [b"evil"])]).run()
        self.assertEqual((real / "owned").read_bytes(), b"untouched")
        self.assert_original_config()

    def test_case_and_unicode_normalization_collisions_rejected(self):
        for names in (("Dir/file", "dir/file"), ("caf\u00e9/file", "cafe\u0301/file")):
            with self.subTest(names=names), self.assertRaises(ValueError):
                self.updater([self.fixture.asset(n, [b"data"]) for n in names])

    def test_chunk_extents_must_cover_target_exactly(self):
        asset = self.fixture.asset("file", [b"aa", b"bb"])
        for chunk in (replace(asset.chunks[1], offset=1), replace(asset.chunks[1], offset=3)):
            with self.subTest(offset=chunk.offset), self.assertRaises(ValueError):
                self.updater([replace(asset, chunks=(asset.chunks[0], chunk))])

    def test_manifest_file_cannot_be_parent_of_another_asset(self):
        with self.assertRaises(ValueError):
            self.updater([self.fixture.asset("parent", [b"a"]), self.fixture.asset("parent/file", [b"b"])])

    def test_config_preserves_other_values_and_crlf(self):
        self.write("config.ini", b"[General]\r\ngame_version = 1.0.0 \r\nnote=1.0.0\r\n")
        self.updater([]).run()
        self.assertEqual((self.root / "config.ini").read_bytes(),
                         b"[General]\r\ngame_version = 2.0.0 \r\nnote=1.0.0\r\n")

    def test_journal_retains_obsolete_ownership_when_source_service_disappears(self):
        target = self.fixture.asset("new", [b"new"])
        old = self.fixture.asset("obsolete", [b"old"])
        self.write(old.name, b"old")
        self.updater([target], [old]).run(predownload=True)
        self.updater([target], None).run()
        self.assertFalse((self.root / old.name).exists())

    def test_cancel_before_start_does_not_commit_version(self):
        cancel = threading.Event()
        cancel.set()
        with self.assertRaises(Cancelled):
            self.updater([self.fixture.asset("file", [b"data"])], cancel=cancel).run()
        self.assert_original_config()
        self.assertEqual(self.fixture.calls, [])

    def test_cancel_at_finalization_preserves_old_version_and_can_resume(self):
        cancel = threading.Event()
        def event(value):
            if value["stage"] == "finalizing":
                cancel.set()
        target = self.fixture.asset("file", [b"target"])
        with self.assertRaises(Cancelled):
            self.updater([target], cancel=cancel, event=event).run()
        self.assertEqual((self.root / "file").read_bytes(), b"target")
        self.assert_original_config()
        calls = list(self.fixture.calls)
        self.updater([target]).run()
        self.assertEqual(self.fixture.calls, calls)
        self.assert_version("2.0.0")

    def test_verify_detects_same_size_corruption_after_update(self):
        target = self.fixture.asset("file", [b"data"])
        updater = self.updater([target])
        updater.run()
        self.write("file", b"oops")
        self.assertEqual(updater.verify(), ["file"])
        self.updater([target]).run()
        self.assertEqual((self.root / "file").read_bytes(), b"data")

    def test_stream_hashing_does_not_read_entire_asset(self):
        content = b"x" * (engine.BLOCK * 2 + 23)
        target = self.fixture.asset("large", [content])
        self.write("large", content)
        original = Path.read_bytes
        def bounded_read(path):
            if path.name == "large":
                self.fail("Updater loaded a whole large asset using Path.read_bytes")
            return original(path)
        with patch.object(Path, "read_bytes", bounded_read):
            self.updater([target], [target]).run()


if __name__ == "__main__":
    unittest.main()
