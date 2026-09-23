"""Read-only independence checks for development copies of game installations."""
import os
import json
from pathlib import Path
import stat
import tempfile


def guard_auxiliary_path(path, protected_roots, label):
    resolved = path.resolve()
    if any(resolved == root or root in resolved.parents for root in protected_roots):
        raise ValueError(label + ' must be outside original and target game directories')
    return resolved


def write_json_result(path, value):
    # Atomic replacement also preserves an original game file if an external
    # output name was hardlinked to it; never truncate the shared inode.
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', dir=path.parent,
                                         prefix=path.name + '.', delete=False) as stream:
            temporary = Path(stream.name)
            json.dump(value, stream, indent=2)
            stream.write('\n')
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


def inventory(root, *, reject_symlinks=False):
    """lstat every entry without following links, including renamed hardlinks."""
    entries = {}
    pending = [root]
    while pending:
        path = pending.pop()
        value = path.lstat()
        if reject_symlinks and stat.S_ISLNK(value.st_mode):
            raise ValueError('Clone contains a symlink')
        entries[str(path.relative_to(root))] = (
            value.st_dev, value.st_ino, value.st_mode, value.st_size,
            value.st_mtime_ns, value.st_ctime_ns,
        )
        if stat.S_ISDIR(value.st_mode):
            with os.scandir(path) as children:
                pending.extend(Path(child.path) for child in children)
    return entries


def guard_clone(original, clone):
    original, clone = original.resolve(strict=True), clone.resolve(strict=True)
    if not original.is_dir() or not clone.is_dir():
        raise ValueError('Original and clone must both be directories')
    if original == clone or original in clone.parents or clone in original.parents:
        raise ValueError('Original and clone must be disjoint canonical directories')
    original_entries = inventory(original)
    clone_entries = inventory(clone, reject_symlinks=True)
    original_inodes = {entry[:2] for entry in original_entries.values()}
    clone_inodes = {entry[:2] for entry in clone_entries.values()}
    if original_inodes & clone_inodes:
        raise ValueError('Clone shares an inode with the original (including differently named entries)')
    return original, clone, original_entries, clone_entries
