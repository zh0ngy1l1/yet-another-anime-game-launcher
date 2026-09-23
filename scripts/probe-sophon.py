#!/usr/bin/env python3
"""Read-only global Genshin Sophon metadata probe; never applies an update.

Requires the locked Sophon environment and `build-sophon.py --proto-only`.
All output goes under
--output, which must be outside --game-dir. Credentials are held only in memory;
API responses are sanitized before writing. No updater modules are imported.
"""
from __future__ import annotations

import argparse
import collections
import hashlib
import json
import pathlib
import re
import ssl
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request

import certifi
import zstandard
from google.protobuf.unknown_fields import UnknownFieldSet


def sanitize(value):
    if isinstance(value, dict):
        return {
            key: "[REDACTED]"
            if any(word in key.lower() for word in ("password", "token", "cookie", "authorization"))
            or (key.lower() == "url_suffix" and bool(item))
            else sanitize(item)
            for key, item in value.items()
        }
    if isinstance(value, list):
        return [sanitize(item) for item in value]
    if isinstance(value, str) and value.startswith(("https://", "http://")):
        parts = urllib.parse.urlsplit(value)
        return urllib.parse.urlunsplit((parts.scheme, parts.netloc, parts.path, "", ""))
    return value


def unknown_fields(message, counts):
    for field in UnknownFieldSet(message):
        counts[f"{message.DESCRIPTOR.name}/{field.field_number}/{field.wire_type}"] += 1
    for descriptor, value in message.ListFields():
        if descriptor.type == descriptor.TYPE_MESSAGE:
            for item in value if descriptor.is_repeated else [value]:
                unknown_fields(item, counts)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--game-dir", required=True, type=pathlib.Path)
    parser.add_argument("--output", required=True, type=pathlib.Path)
    parser.add_argument("--source-tag", help="Defaults to config.ini's game_version")
    args = parser.parse_args()
    game = args.game_dir.resolve(strict=True)
    output = args.output.resolve()
    if output == game or game in output.parents or output in game.parents:
        parser.error("Output and game directory must be disjoint")
    if not (game / "GenshinImpact.exe").is_file():
        parser.error("This investigation tool supports global Genshin installations")
    config = (game / "config.ini").read_text()
    configured = re.search(r"(?m)^game_version=(\d+\.\d+\.\d+)", config)
    if not configured and not args.source_tag:
        parser.error("Cannot determine source tag; specify --source-tag")
    source_tag = args.source_tag or configured.group(1)
    if not re.fullmatch(r"\d+\.\d+\.\d+", source_tag):
        parser.error("Invalid source version tag")
    if output.exists():
        parser.error("Output directory must not already exist; choose a fresh directory")
    output.mkdir(parents=True, exist_ok=False)
    proto = output / "proto"
    proto.mkdir(exist_ok=True)
    repo = pathlib.Path(__file__).resolve().parents[1]
    subprocess.run(
        [str(repo / ".tmp/protoc-build/protoc"), "-I", str(repo / "sophon_server"),
         f"--python_out={proto}", str(repo / "sophon_server/manifest.proto"),
         str(repo / "sophon_server/manifest_ldiff.proto")],
        check=True,
    )
    sys.path.insert(0, str(proto))
    import manifest_pb2
    import manifest_ldiff_pb2

    context = ssl.create_default_context(cafile=certifi.where())
    statuses = []

    def fetch_bytes(url, *, post=False, maximum=64 * 1024 * 1024):
        req = urllib.request.Request(url, data=b"" if post else None)
        try:
            with urllib.request.urlopen(req, context=context, timeout=90) as response:
                data = response.read(maximum + 1)
                if len(data) > maximum:
                    raise ValueError("Response exceeds investigation size bound")
                return response.status, data
        except urllib.error.HTTPError as error:
            raise RuntimeError(f"HTTP request failed with status {error.code}") from None
        except urllib.error.URLError:
            raise RuntimeError("HTTPS request failed; credentials omitted") from None

    def fetch_json(name, url, *, post=False):
        status, data = fetch_bytes(url, post=post)
        result = json.loads(data)
        (output / f"{name}.json").write_text(json.dumps(sanitize(result), indent=2))
        event = {"request": name, "http": status, "retcode": result.get("retcode")}
        statuses.append(event)
        print(json.dumps(event), flush=True)
        return result

    base = "https://sg-hyp-api.hoyoverse.com/hyp/hyp-connect/api/"
    branches = fetch_json(
        "branches", base + "getGameBranches?game_ids[]=gopR6Cufr3&launcher_id=VYTpXlbWo8"
    )
    branch = branches["data"]["game_branches"][0]["main"]
    query = urllib.parse.urlencode({key: branch[key] for key in ("branch", "package_id", "password")})
    downloader = "https://sg-downloader-api.hoyoverse.com/downloader/sophon_chunk/api/"
    builds = {}
    for name, method, extra in (
        ("target", "getBuild", ""),
        ("source", "getBuild", "&" + urllib.parse.urlencode({"tag": source_tag})),
        ("patch", "getPatchBuild", ""),
    ):
        builds[name] = fetch_json(name, downloader + method + "?" + query + extra, post=method == "getPatchBuild")
    fetch_json("wpf", base + "getWPFPackages?launcher_id=VYTpXlbWo8")
    summaries = []
    for kind, build in builds.items():
        if build.get("retcode") != 0:
            continue
        for category in build["data"]["manifests"]:
            field = category["matching_field"]
            if not re.fullmatch(r"[a-zA-Z0-9_-]+", field):
                raise ValueError("Unsafe category name")
            descriptor = category["manifest"]
            download = category["manifest_download"]
            if download.get("encryption", 0) != 0 or download.get("compression") != 1:
                raise ValueError("Unsupported manifest encoding in investigation")
            status, data = fetch_bytes(download["url_prefix"] + "/" + descriptor["id"] + download.get("url_suffix", ""))
            expected_size = int(descriptor["uncompressed_size"])
            if not 0 < expected_size <= 128 * 1024 * 1024:
                raise ValueError("Manifest exceeds investigation size bound")
            raw = zstandard.ZstdDecompressor().decompress(data, max_output_size=expected_size)
            if len(data) != int(descriptor["compressed_size"]) or len(raw) != expected_size:
                raise ValueError("Manifest size mismatch")
            if hashlib.md5(raw).hexdigest() != descriptor["checksum"]:
                raise ValueError("Manifest checksum mismatch")
            (output / f"{kind}-{field}.zstd").write_bytes(data)
            (output / f"{kind}-{field}.pb").write_bytes(raw)
            message = manifest_ldiff_pb2.DiffManifest() if kind == "patch" else manifest_pb2.Manifest()
            message.ParseFromString(raw)
            unknown = collections.Counter()
            unknown_fields(message, unknown)
            row = {"kind": kind, "category": field, "tag": build["data"]["tag"],
                   "http": status, "files": len(message.files), "unknown_fields": dict(unknown)}
            if kind == "patch":
                row["patch_tags"] = dict(collections.Counter(p.key for f in message.files for p in f.patches))
                row["deletions"] = {entry.key: len(entry.info.list) for entry in message.files_delete}
            else:
                row["chunks"] = sum(len(f.chunks) for f in message.files)
                row["flags"] = dict(collections.Counter(f.flags for f in message.files))
                row["uncompressed_bytes"] = sum(f.size for f in message.files)
            summaries.append(row)
            print(json.dumps(row), flush=True)
    (output / "manifest-summary.json").write_text(json.dumps(summaries, indent=2))
    (output / "request-statuses.json").write_text(json.dumps(statuses, indent=2))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        # Do not expose urllib exception URLs or untrusted server messages.
        print(f"Investigation failed ({type(error).__name__}); request credentials omitted.", file=sys.stderr)
        sys.exit(1)
