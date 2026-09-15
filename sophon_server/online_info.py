"""Read startup download totals from Sophon's small build metadata response."""


def game_download_size(build, expected_version):
    if not isinstance(build, dict) or build.get("retcode") != 0:
        raise ValueError("Sophon build metadata request failed")
    data = build.get("data")
    if not isinstance(data, dict) or data.get("tag") != expected_version:
        raise ValueError("Sophon build metadata version mismatch")
    manifests = data.get("manifests")
    if not isinstance(manifests, list):
        raise ValueError("Missing Sophon manifest summaries")
    games = [m for m in manifests if isinstance(m, dict) and m.get("matching_field") == "game"]
    if len(games) != 1:
        raise ValueError("Expected exactly one Sophon game summary")
    stats = games[0].get("stats")
    size = stats.get("compressed_size") if isinstance(stats, dict) else None
    if not isinstance(size, str) or not size.isascii() or not size.isdecimal():
        raise ValueError("Invalid Sophon game download size")
    value = int(size)
    if value <= 0:
        raise ValueError("Invalid Sophon game download size")
    return value
