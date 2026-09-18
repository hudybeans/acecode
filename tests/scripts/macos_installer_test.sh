#!/usr/bin/env bash
# No certificates, keychain access or network submissions.
set -euo pipefail
root="$(cd "$(dirname "$0")/../.." && pwd)"
[[ "$(uname -s)" == Darwin ]] || { printf 'SKIP: Swift/AppKit tests require macOS\n'; exit 0; }
work="$(mktemp -d "${TMPDIR:-/tmp}/acecode-installer-tests.XXXXXX")"
trap 'rm -rf -- "$work"' EXIT
source_dir="$root/packaging/macos-installer"
xcrun swiftc -swift-version 5 -Onone "$source_dir/Engine.swift" "$source_dir/Tests.swift" -o "$work/tests"
"$work/tests"
for arch in x86_64 arm64; do
    xcrun swiftc -swift-version 5 -O -target "${arch}-apple-macosx11.0" \
        -sdk "$(xcrun --sdk macosx --show-sdk-path)" -framework AppKit \
        "$source_dir/Engine.swift" "$source_dir/main.swift" -o "$work/installer-$arch"
    /usr/bin/lipo "$work/installer-$arch" -verify_arch "$arch"
    xcrun vtool -show-build "$work/installer-$arch" | grep -Eq 'minos[[:space:]]+11\.0'
done
