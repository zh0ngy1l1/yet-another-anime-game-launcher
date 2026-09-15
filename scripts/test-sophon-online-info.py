#!/usr/bin/env python3
"""Harmless startup metadata regression; no game, network or bundled process."""
import ast
import copy
import importlib.util
import json
import pathlib
import shutil
import tempfile
import unittest
from types import SimpleNamespace
from typing import Literal

ROOT = pathlib.Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("online_info", ROOT / "sophon_server/online_info.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
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
        tree = ast.parse((ROOT / "sophon_server/tasks.py").read_text())
        function = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == "fetch_online_game_info")
        calls = []
        class Client:
            def initialize(self, options): self.options = options
            def retrieve_API_keys(self):
                if self.options.predownload: raise AssertionError("No pre-download branch")
                self.branches_json = {"tag": "7.0.0", "diff_tags": ["6.7.0", "6.6.0"]}
            def get_getBuild_json(self, new_files):
                calls.append(new_files)
                return BUILD
            def load_manifest(self, category): raise AssertionError("Chunk CDN must not be contacted during startup")
        with tempfile.TemporaryDirectory() as directory:
            namespace = dict(Literal=Literal, OnlineGameInfo=lambda **kwargs: kwargs,
                Options=lambda: SimpleNamespace(predownload=False), SophonClient=Client,
                pathlib=SimpleNamespace(Path=lambda _: pathlib.Path(directory) / "gametemp"),
                shutil=shutil, RUN_MEMORY_HACK=False, game_download_size=module.game_download_size)
            exec(compile(ast.Module(body=[function], type_ignores=[]), "startup-task", "exec"), namespace)
            result = namespace["fetch_online_game_info"]("os", "hk4e")
        self.assertIsNone(result["error"])
        self.assertEqual(result["install_size"], 121313081970)
        self.assertEqual(result["version"], "7.0.0")
        self.assertFalse(result["pre_download"])
        self.assertEqual(calls, [True])


if __name__ == "__main__":
    unittest.main()
