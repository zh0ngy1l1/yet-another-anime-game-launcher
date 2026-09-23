#!/usr/bin/env python3
"""Harmless startup metadata regression; no game, network or bundled process."""
import copy
import pathlib
import sys
import unittest
from unittest.mock import patch

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "sophon_server"))
import online_info as module
from tasks import fetch_online_game_info

BUILD = {"retcode": 0, "data": {"tag": "7.0.0", "manifests": [
    {"matching_field": "game", "stats": {"compressed_size": "121313081970"},
     "deduplicated_stats": {"compressed_size": "121184596600"},
     "manifest": {"compressed_size": "8526970"}},
    {"matching_field": "en-us", "stats": {"compressed_size": "17674754195"}}
]}}


class OnlineInfoTests(unittest.TestCase):
    def test_preserves_total_including_duplicate_chunks(self):
        self.assertEqual(module.game_download_size(BUILD, "7.0.0"), 121313081970)

    def test_wrong_version_rejected(self):
        with self.assertRaises(ValueError):
            module.game_download_size(BUILD, "6.7.0")

    def test_failed_response_rejected(self):
        with self.assertRaises(ValueError):
            module.game_download_size({"retcode": -1, "data": BUILD["data"]}, "7.0.0")

    def test_ambiguous_game_rejected(self):
        value = copy.deepcopy(BUILD)
        value["data"]["manifests"].append(value["data"]["manifests"][0])
        with self.assertRaises(ValueError):
            module.game_download_size(value, "7.0.0")

    def test_missing_summary_rejected(self):
        for value in [{}, {"retcode": 0}, {"retcode": 0, "data": {"tag": "7.0.0", "manifests": []}}]:
            with self.subTest(value=value), self.assertRaises(ValueError):
                module.game_download_size(value, "7.0.0")

    def test_invalid_sizes_rejected(self):
        for size in [None, True, 0, "0", "-1", "1.5", "１２", "12 MB"]:
            value = copy.deepcopy(BUILD)
            value["data"]["manifests"][0]["stats"]["compressed_size"] = size
            with self.subTest(size=size), self.assertRaises(ValueError):
                module.game_download_size(value, "7.0.0")

    def test_startup_never_needs_manifest_download(self):
        # Run the actual startup task with a fake server whose chunk/manifest
        # route is unavailable. Preserve version, size and no-preload behavior.
        for game in ("hk4e", "nap"):
            for preload in (False, True):
                with self.subTest(game=game, preload=preload):
                    calls = []
                    class Client:
                        def retrieve_API_keys(self):
                            calls.append((self.game_type, self.rel_type, self.branch))
                            if self.branch == "pre_download" and not preload:
                                raise AssertionError("No pre-download branch")
                            self.branches_json = {"tag": "7.0.0" if self.branch == "main" else "7.1.0",
                                                  "diff_tags": ["6.7.0", "6.6.0"]}
                        def get_getBuild_json(self, new_files):
                            self_test.assertTrue(new_files)
                            return BUILD
                    self_test = self
                    with patch("tasks.SophonClient", Client), patch("tasks.RUN_MEMORY_HACK", False), \
                         patch.object(pathlib.Path, "mkdir", side_effect=AssertionError("Metadata must not create game directories")):
                        result = fetch_online_game_info("os", game)
                    self.assertIsNone(result.error)
                    self.assertEqual(result.install_size, 121313081970)
                    self.assertEqual(result.version, "7.0.0")
                    self.assertEqual(result.pre_download, preload)
                    self.assertEqual(result.pre_download_version, "7.1.0" if preload else "0.0.0")
                    self.assertEqual(result.full_manifest_update, game == "hk4e")
                    self.assertEqual(calls, [(game, "os", "main"), (game, "os", "pre_download")])


if __name__ == "__main__":
    unittest.main()
