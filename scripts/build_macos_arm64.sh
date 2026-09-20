#!/usr/bin/env bash
# Build a generic Apple Silicon macOS portable ACECode package.
# Usage: scripts/build_macos_arm64.sh [suffix]
set -euo pipefail

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
    cat <<'USAGE'
Usage: scripts/build_macos_arm64.sh [suffix]

Builds a generic Apple Silicon (arm64) macOS portable ZIP.
The default output is dist/acecode-<version>-macos-arm64-release-portable.zip.
Optional environment overrides: NODE_BIN_DIR, VCPKG_ROOT, CMAKE_BIN.
USAGE
    exit 0
fi

repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
suffix="${1:-release}"
[[ "$suffix" != -* && "$suffix" != */* ]] || {
    printf 'ERROR: suffix must not start with - or contain /\n' >&2
    exit 2
}

export PATH="${NODE_BIN_DIR:-$HOME/.nvm/versions/node/v22.22.2/bin}:$PATH"
export VCPKG_ROOT="${VCPKG_ROOT:-$HOME/vcpkg}"

cd "$repo_root"
[[ -d "$VCPKG_ROOT" ]] || {
    printf 'ERROR: VCPKG_ROOT does not exist: %s\n' "$VCPKG_ROOT" >&2
    exit 1
}

command -v python3 >/dev/null || { echo 'ERROR: python3 not found' >&2; exit 1; }
command -v corepack >/dev/null || { echo 'ERROR: corepack not found; install Node.js 22+' >&2; exit 1; }

printf '== building frontend ==\n'
(
    cd "$repo_root/web"
    corepack pnpm install --frozen-lockfile
    corepack pnpm test
    corepack pnpm build
)

version="$(grep -m1 'project(acecode VERSION' "$repo_root/CMakeLists.txt" \
    | sed -E 's/.* VERSION ([0-9.]+).*/\1/')"
output="$repo_root/dist/acecode-${version}-macos-arm64-${suffix}-portable.zip"
build_dir="$repo_root/build/macos-arm64-release"

printf '== building package ==\n'
bash "$repo_root/scripts/macos_create_portable_zip.sh" \
    --arch arm64 \
    --suffix "$suffix" \
    --build-dir "$build_dir" \
    --output "$output"

printf '\nPACKAGE_PATH=%s\n' "$output"
printf 'PACKAGE_SHA256=%s\n' "$(shasum -a 256 "$output" | awk '{print $1}')"
printf 'PACKAGE_SIZE=%s\n' "$(du -h "$output" | awk '{print $1}')"
