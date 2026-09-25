#!/usr/bin/env python3
"""Require Deepin packages to use system Qt/DTK libraries and plugins."""

import argparse
from pathlib import Path
import re


def verify_deepin_package(directory):
    directory = Path(directory)
    if not directory.is_dir():
        raise ValueError(f"Missing package directory: {directory}")
    # Qt platform, theme, image and style plugins use the libq*.so convention.
    # Include versioned libraries and symlinks, even if their target is absent.
    runtime_name = re.compile(r"lib(?:qt[56]|dtk|dxcb|q)[^/]*\.so(?:\..*)?$", re.I)
    bundled = [str(path.relative_to(directory)) for path in directory.rglob("*")
               if (path.is_file() or path.is_symlink()) and
               runtime_name.fullmatch(path.name)]
    if bundled:
        raise ValueError("Bundled Qt/DTK runtime is forbidden:\n" +
                         "\n".join(sorted(bundled)))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path)
    args = parser.parse_args()
    try:
        verify_deepin_package(args.directory)
    except (OSError, ValueError) as error:
        parser.exit(1, f"{error}\n")
    print("Verified: no bundled Qt/DTK runtime libraries or plugins.")
