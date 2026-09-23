#!/usr/bin/env python3
"""Independently verify a clone against saved official Sophon manifests.

Reads only clone/original/manifest inputs; writes one external JSON result.
Imports generated protobuf definitions, never the updater implementation.
Requires protobuf and grpcio-tools (the probe's Python environment provides both).
"""
from __future__ import annotations

import argparse
import concurrent.futures
import configparser
import hashlib
import importlib.util
import json
import os
from pathlib import Path, PurePosixPath
import re
import stat
import subprocess
import sys
import tempfile
import time
import unicodedata

BLOCK = 1024 * 1024


def safe_name(name):
    if not isinstance(name, str) or not name or any(c in name for c in ("\\", ":", "\0")):
        raise ValueError("Invalid manifest/inventory path")
    if PurePosixPath(name).is_absolute() or any(p in ("", ".", "..") for p in name.split("/")):
        raise ValueError("Invalid manifest/inventory path")
    return name


def safe_path(root, name):
    current = root
    for part in safe_name(name).split("/"):
        current /= part
        if current.is_symlink():
            raise ValueError("Symlink in inspected path: " + name)
    return current


def digest(path, algorithm="md5"):
    value = hashlib.new(algorithm)
    with path.open("rb") as stream:
        while data := stream.read(BLOCK):
            value.update(data)
    return value.hexdigest()


def inventory(root):
    rows = []
    for directory, subdirs, files in os.walk(root, followlinks=False):
        for name in subdirs:
            if (Path(directory) / name).is_symlink():
                raise ValueError("Symlink directory in inspected installation")
        for name in files:
            path = Path(directory) / name
            info = path.lstat()
            rows.append({"path": str(path.relative_to(root)), "size": info.st_size,
                         "mtime_ns": info.st_mtime_ns, "inode": info.st_ino, "mode": info.st_mode})
    return sorted(rows, key=lambda row: row["path"])


def protobuf_module(directory):
    source = Path(__file__).resolve().parents[1] / "sophon_server" / "manifest.proto"
    subprocess.run([sys.executable, "-m", "grpc_tools.protoc", "-I", str(source.parent),
                    "--python_out=" + str(directory), str(source)], check=True)
    spec = importlib.util.spec_from_file_location("manifest_pb2", directory / "manifest_pb2.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def load_build(directory, kind, categories, module, *, optional=False):
    metadata = directory / (kind + ".json")
    if optional and not metadata.is_file():
        return None, {}
    response = json.loads(metadata.read_text())
    if response.get("retcode") != 0:
        if optional:
            return None, {}
        raise ValueError("Saved target API response was unsuccessful")
    build = response["data"]
    version = build["tag"]
    if not re.fullmatch(r"\d+\.\d+\.\d+", version):
        raise ValueError("Invalid saved build version")
    available = {entry["matching_field"]: entry for entry in build["manifests"]}
    assets = {}
    folded = {}
    for category in categories:
        if category not in available:
            if optional:
                continue
            raise ValueError("Selected category missing from target build")
        descriptor = available[category]["manifest"]
        path = directory / f"{kind}-{category}.pb"
        expected_size = int(descriptor["uncompressed_size"])
        if not 0 <= expected_size <= 256 * BLOCK or path.stat().st_size != expected_size:
            raise ValueError("Saved manifest size mismatch")
        if digest(path) != descriptor["checksum"].lower():
            raise ValueError("Saved manifest MD5 mismatch")
        manifest = module.Manifest()
        manifest.ParseFromString(path.read_bytes())  # bounded metadata only
        for item in manifest.files:
            name = safe_name(item.filename)
            if item.flags not in (0, 64) or item.size < 0:
                raise ValueError("Unsupported asset metadata")
            if item.flags == 0 and not re.fullmatch(r"[0-9a-fA-F]{32}", item.md5):
                raise ValueError("Invalid asset MD5")
            value = {"size": item.size, "md5": item.md5.lower(), "directory": item.flags == 64}
            key = unicodedata.normalize("NFC", name).casefold()
            if key in folded and folded[key] != name:
                raise ValueError("Case/Unicode-colliding manifest paths")
            folded[key] = name
            if name in assets and assets[name] != value:
                raise ValueError("Conflicting category assets")
            assets[name] = value
    return version, assets


def game_versions(path):
    versions = set()
    pattern = re.compile(br"\0(\d+\.\d+\.\d+)_\d+_\d+\0")
    previous = b""
    with path.open("rb") as stream:
        while block := stream.read(BLOCK):
            window = previous + block
            versions.update(value.decode("ascii") for value in pattern.findall(window))
            previous = window[-1024:]
    return sorted(versions)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--clone", required=True, type=Path)
    parser.add_argument("--original", required=True, type=Path)
    parser.add_argument("--manifest-dir", required=True, type=Path)
    parser.add_argument("--original-inventory", required=True, type=Path)
    parser.add_argument("--original-hashes", type=Path,
                        help="Optional JSON {algorithm: sha256, files: {relative_path: digest}}")
    parser.add_argument("--categories", required=True,
                        help="Comma-separated selected matching_field values used for the update")
    parser.add_argument("--result", required=True, type=Path)
    args = parser.parse_args()
    clone = args.clone.resolve(strict=True)
    original = args.original.resolve(strict=True)
    manifests = args.manifest_dir.resolve(strict=True)
    result_path = args.result.resolve()
    if clone == original or original in clone.parents or clone in original.parents:
        parser.error("Clone and original must be disjoint canonical directories")
    for root in (clone, original):
        if result_path == root or root in result_path.parents:
            parser.error("Result must be outside both game directories")
    categories = tuple(dict.fromkeys(args.categories.split(",")))
    if not categories or any(not re.fullmatch(r"[a-zA-Z0-9_-]+", value) for value in categories):
        parser.error("Invalid manifest category")
    started = time.monotonic()
    with tempfile.TemporaryDirectory(prefix="yaagl-independent-protobuf-") as temporary:
        module = protobuf_module(Path(temporary))
        target_version, targets = load_build(manifests, "target", categories, module)
        source_version, sources = load_build(manifests, "source", categories, module, optional=True)
    if not targets:
        raise ValueError("Target manifest contains no selected assets")

    def verify(item):
        name, asset = item
        try:
            path = safe_path(clone, name)
            if asset["directory"]:
                return {"path": name, "status": "verified_directory" if path.is_dir() else "missing_directory"}
            if not path.is_file():
                return {"path": name, "status": "missing"}
            info = path.stat()
            if info.st_size != asset["size"]:
                return {"path": name, "status": "wrong_size", "actual": info.st_size,
                        "expected": asset["size"]}
            computed = digest(path)
            return {"path": name, "status": "verified" if computed == asset["md5"] else "wrong_md5",
                    "size": info.st_size, "md5": computed}
        except (ValueError, OSError) as error:
            return {"path": name, "status": "inspection_error", "error_type": type(error).__name__}

    rows = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
        for number, row in enumerate(executor.map(verify, targets.items()), 1):
            rows.append(row)
            if number % 300 == 0:
                print(json.dumps({"verified_progress": number, "total_assets": len(targets)}), flush=True)
    config = configparser.ConfigParser()
    with safe_path(clone, "config.ini").open() as stream:
        config.read_file(stream)
    config_version = config.get("General", "game_version", fallback="")
    managers = [name for name in targets if PurePosixPath(name).name == "globalgamemanagers"]
    detected = {name: game_versions(safe_path(clone, name)) for name in managers}
    version_ok = bool(detected) and all(value == [target_version] for value in detected.values())
    obsolete_files_present = []
    obsolete_directories_present = []
    for name in sorted(sources.keys() - targets.keys()):
        path = safe_path(clone, name)
        if path.exists():
            (obsolete_directories_present if sources[name]["directory"] else obsolete_files_present).append(name)
    before = json.loads(args.original_inventory.read_text())
    for row in before:
        safe_name(row["path"])
    original_files = inventory(original)
    # This proves preservation of the recorded stat inventory, not every byte
    # of the original. Content provenance is limited to explicit anchor hashes.
    original_unchanged = original_files == sorted(before, key=lambda row: row["path"])
    anchors = {}
    if args.original_hashes:
        baseline = json.loads(args.original_hashes.read_text())
        if baseline.get("algorithm") not in ("md5", "sha256"):
            raise ValueError("Unsupported original provenance hash algorithm")
        for name, expected in baseline["files"].items():
            anchors[name] = digest(safe_path(original, name), baseline["algorithm"]) == expected.lower()
    # Compare all file identities, including differently named files. Checking
    # only the same relative path misses a hardlink under another clone name.
    original_file_ids = set()
    for item in original_files:
        if stat.S_ISREG(item["mode"]):
            info = safe_path(original, item["path"]).stat()
            original_file_ids.add((info.st_dev, info.st_ino))
    inode_collisions = []
    clone_files = inventory(clone)
    for item in clone_files:
        if not stat.S_ISREG(item["mode"]):
            raise ValueError("Non-regular file in clone")
        info = safe_path(clone, item["path"]).stat()
        if (info.st_dev, info.st_ino) in original_file_ids:
            inode_collisions.append(item["path"])
    failures = [row for row in rows if row["status"] not in ("verified", "verified_directory")]
    success = (source_version is not None and not failures and config_version == target_version and version_ok and
               not obsolete_files_present and original_unchanged and all(anchors.values()) and not inode_collisions)
    result = {"success": success, "clone": str(clone), "original": str(original),
              "categories": list(categories), "target_version": target_version, "source_version": source_version,
              "target_files": sum(not asset["directory"] for asset in targets.values()),
              "target_bytes": sum(asset["size"] for asset in targets.values()),
              "verified_files": sum(row["status"] == "verified" for row in rows),
              "failures": failures, "config_version": config_version, "detected_versions": detected,
              "obsolete_files_present": obsolete_files_present,
              "obsolete_directories_present": obsolete_directories_present,
              "obsolete_check_has_source_manifest": source_version is not None,
              "original_inventory_unchanged": original_unchanged,
              "original_anchor_hashes_unchanged": anchors, "shared_file_inodes": inode_collisions,
              "elapsed_seconds": time.monotonic() - started, "assets": rows}
    result_path.parent.mkdir(parents=True, exist_ok=True)
    result_path.write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps({key: value for key, value in result.items() if key != "assets"}), flush=True)
    return 0 if success else 1


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        # Saved API metadata can contain authentication data; do not echo it.
        print(f"Independent verification could not complete ({type(error).__name__}).", file=sys.stderr)
        raise SystemExit(2) from None
