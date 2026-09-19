#!/usr/bin/env python3
"""Select only exact, trusted macOS updater ZIP names, never installer assets."""
import argparse
from pathlib import Path


def select_assets(directory, version):
    if not version or any(c not in '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ.-+' for c in version):
        raise ValueError('Invalid release version')
    selected = []
    for arch in ('x64', 'arm64'):
        name = f'ACECode-{version}-macos-{arch}-update.zip'
        matches = [p for p in Path(directory).rglob(name) if p.is_file() and not p.is_symlink()]
        if len(matches) != 1:
            raise ValueError(f'Expected exactly one updater asset {name}; found {len(matches)}')
        selected.append(matches[0])
    return selected


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('directory', type=Path)
    parser.add_argument('version')
    args = parser.parse_args()
    try:
        for asset in select_assets(args.directory, args.version):
            print(asset)
    except ValueError as error:
        parser.exit(1, f'{error}\n')
