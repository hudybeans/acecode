#!/usr/bin/env bash
# No certificates, keychain access or network submissions.
set -euo pipefail
root="$(cd "$(dirname "$0")/../.." && pwd)"
[[ "$(uname -s)" == Darwin ]] || { printf 'SKIP: Swift/AppKit tests require macOS\n'; exit 0; }
work="$(mktemp -d "${TMPDIR:-/tmp}/acecode-installer-tests.XXXXXX")"
trap 'rm -rf -- "$work"' EXIT
source_dir="$root/packaging/macos-installer"
xcrun swiftc -swift-version 5 -Onone "$source_dir/Engine.swift" "$source_dir/Tests.swift" -o "$work/tests"
python3 - "$work/tests" <<'PY'
import subprocess
import sys
subprocess.run([sys.argv[1]], check=True, timeout=120)
PY
for arch in x86_64 arm64; do
    xcrun swiftc -swift-version 5 -O -target "${arch}-apple-macosx11.0" \
        -sdk "$(xcrun --sdk macosx --show-sdk-path)" -framework AppKit \
        "$source_dir/Engine.swift" "$source_dir/main.swift" -o "$work/installer-$arch"
    /usr/bin/lipo "$work/installer-$arch" -verify_arch "$arch"
    xcrun vtool -show-build "$work/installer-$arch" | grep -Eq 'minos[[:space:]]+11\.0'
done

# Exercise application startup as a real bundle, not only Swift compilation.
smoke_app="$work/ACECode Installer.app"
mkdir -p "$smoke_app/Contents/MacOS" "$smoke_app/Contents/Resources/ACECode.app/Contents"
cp "$work/installer-$(uname -m)" "$smoke_app/Contents/MacOS/ACECodeInstaller"
python3 - "$smoke_app" <<'PY'
from pathlib import Path
import plistlib
import subprocess
import sys

app = Path(sys.argv[1])
with (app / 'Contents/Info.plist').open('wb') as stream:
    plistlib.dump({'CFBundleExecutable': 'ACECodeInstaller',
                  'CFBundleIdentifier': 'dev.acecode.userinstaller.tests',
                  'CFBundlePackageType': 'APPL'}, stream)
with (app / 'Contents/Resources/ACECode.app/Contents/Info.plist').open('wb') as stream:
    plistlib.dump({'CFBundleIdentifier': 'dev.acecode.desktop',
                  'CFBundleShortVersionString': '0.0.0'}, stream)
for scope in ('personal', 'system'):
    image = app.parent / f'installer-{scope}.png'
    args = [str(app / 'Contents/MacOS/ACECodeInstaller'), '--snapshot', str(image)]
    if scope == 'system':
        args.append('--preview-system')
    subprocess.run(args, check=True, timeout=30)
    assert image.read_bytes().startswith(b'\x89PNG\r\n\x1a\n'), 'Missing window snapshot'
print('Native installer window startup passed (personal and system scopes)')
PY
