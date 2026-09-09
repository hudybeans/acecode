"""Cross-platform exclusive locks for build directories."""

from __future__ import annotations

import contextlib
import os
from pathlib import Path
from typing import Iterator, TextIO


class BuildDirectoryBusy(RuntimeError):
    """Raised when another process is using the same build directory."""


def _lock_file(handle: TextIO) -> None:
    handle.seek(0)
    handle.write("ACECode build directory lock\n")
    handle.flush()
    handle.seek(0)
    if os.name == "nt":
        import msvcrt

        msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
    else:
        import fcntl

        fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)


def _unlock_file(handle: TextIO) -> None:
    handle.seek(0)
    if os.name == "nt":
        import msvcrt

        msvcrt.locking(handle.fileno(), msvcrt.LK_UNLCK, 1)
    else:
        import fcntl

        fcntl.flock(handle.fileno(), fcntl.LOCK_UN)


@contextlib.contextmanager
def build_directory_lock(build_dir: Path) -> Iterator[None]:
    """Hold an OS-released exclusive lock for the lifetime of a build task."""
    build_dir = build_dir.resolve()
    build_dir.mkdir(parents=True, exist_ok=True)
    lock_path = build_dir / ".acecode-build.lock"
    with lock_path.open("a+", encoding="ascii") as handle:
        try:
            _lock_file(handle)
        except (OSError, PermissionError) as error:
            raise BuildDirectoryBusy(
                f"build directory is busy: {build_dir}; "
                "do not run two CMake/Ninja/package tasks against it at once"
            ) from error
        try:
            yield
        finally:
            _unlock_file(handle)
