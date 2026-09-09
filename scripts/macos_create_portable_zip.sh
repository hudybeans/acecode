#!/usr/bin/env bash
# Build a macOS "green"/portable (install-free) package for ACECode.
#
# Layout mirrors CI `.github/workflows/package.yml` "Package (Unix)" macOS branch:
#   acecode (TUI) + README.md + README_CN.md + share/acecode/{models_dev,seed} + ACECode.app
# Zipped with ditto (keeps macOS metadata + symlinks, safe for .app).
#
# WHY THIS SCRIPT EXISTS (a real footgun):
#   Front-end assets are embedded into C++ only at *cmake configure* time
#   (cmake/acecode_embed_assets.cmake -> build/.../generated/static_assets_data.cpp).
#   Running `cmake --build` alone WILL NOT refresh them. If you edit web/ and just
#   rebuild, the zip ships yesterday's UI silently. This script guards against that.
set -euo pipefail

repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
build_dir="$repo_root/build/macos-x64-release"
arch="x86_64"
suffix="portable"
output_path=""

while [[ $# -gt 0 ]]; do
    case "$1" in
        --build-dir) build_dir="${2:-}"; shift 2 ;;
        --arch) arch="${2:-}"; shift 2 ;;
        --suffix) suffix="${2:-}"; shift 2 ;;
        --output) output_path="${2:-}"; shift 2 ;;
        --help|-h) sed -n '2,20p' "${BASH_SOURCE[0]}"; exit 0 ;;
        -*) echo "Unknown option: $1" >&2; exit 2 ;;
        *) suffix="$1"; shift ;;   # first positional arg = suffix
    esac
done

version="$(grep -m1 'project(acecode VERSION' "$repo_root/CMakeLists.txt" | sed -E 's/.* VERSION ([0-9.]+).*/\1/')"
dist_html="$repo_root/web/dist/index.html"
embed_cpp="$build_dir/generated/static_assets_data.cpp"
embed_marker="$build_dir/generated/embedded_web_dist.sha"
package_name="acecode-macos-$arch"
package_dir="$repo_root/dist/$package_name"
[[ -z "$output_path" ]] && output_path="$repo_root/dist/acecode-${version}-macos-${arch}-${suffix}-portable.zip"

echo "== version : $version"
echo "== branch  : $(git -C "$repo_root" rev-parse --abbrev-ref HEAD) @ $(git -C "$repo_root" rev-parse --short HEAD)"
echo "== build   : $build_dir"

# Locate a working cmake. The wrapper at ~/.local/bin/cmake can be a broken
# pip shim; the real binary lives under the cmake package's data/bin/. Prefer
# any candidate that answers --version.
CMAKE_BIN=""
for cand in \
    "$(find "$HOME/.local/lib" -path '*/cmake/data/bin/cmake' -type f 2>/dev/null | head -1)" \
    "$(command -v cmake 2>/dev/null)"; do
    [[ -n "$cand" && -x "$cand" ]] || continue
    if "$cand" --version >/dev/null 2>&1; then CMAKE_BIN="$cand"; break; fi
done
[[ -n "$CMAKE_BIN" ]] || { echo "ERROR: cmake not found" >&2; exit 1; }
echo "== cmake   : $CMAKE_BIN"

# ---------------------------------------------------------------------------
# GUARD 1: front-end source newer than build output? -> forgot `pnpm build`
# ---------------------------------------------------------------------------
if [[ ! -f "$dist_html" ]]; then
    echo "ERROR: web/dist/index.html missing — run 'cd web && pnpm install && pnpm build' first." >&2
    exit 1
fi
newest_src="$(find "$repo_root/web/src" -type f -newer "$dist_html" 2>/dev/null | head -1 || true)"
if [[ -n "$newest_src" ]]; then
    echo "ERROR: front-end source is newer than web/dist (e.g. $newest_src)." >&2
    echo "       You edited web/ but did not rebuild. Run:" >&2
    echo "         cd web && pnpm install && pnpm build" >&2
    exit 1
fi

# ---------------------------------------------------------------------------
# GUARD 2: dist newer than embedded assets? -> forgot to reconfigure cmake.
# Decision is made by BOTH mtime AND a recorded dist hash marker (mtime alone
# can lie after a git checkout/reset rewrites the tree).
# ---------------------------------------------------------------------------
needs_reconfigure=false
if [[ ! -f "$embed_cpp" ]]; then
    needs_reconfigure=true
elif [[ "$dist_html" -nt "$embed_cpp" ]]; then
    needs_reconfigure=true
fi
current_hash="$(shasum -a 256 "$dist_html" | awk '{print $1}')"
if [[ -f "$embed_marker" ]]; then
    embedded_hash="$(cat "$embed_marker" 2>/dev/null || true)"
    [[ "$embedded_hash" != "$current_hash" ]] && needs_reconfigure=true
else
    needs_reconfigure=true
fi

if $needs_reconfigure; then
    echo "== web/dist changed since last embed — reconfiguring cmake (skipping vcpkg install) =="
    "$CMAKE_BIN" -S "$repo_root" -B "$build_dir" -G Ninja \
        -DCMAKE_BUILD_TYPE=Release \
        -DCMAKE_TOOLCHAIN_FILE="$HOME/vcpkg/scripts/buildsystems/vcpkg.cmake" \
        -DVCPKG_TARGET_TRIPLET=x64-osx \
        -DVCPKG_OVERLAY_PORTS="$repo_root/ports" \
        -DCMAKE_OSX_ARCHITECTURES="$arch" \
        -DBUILD_TESTING=OFF -DACECODE_BUILD_DESKTOP=ON \
        -DVCPKG_MANIFEST_FEATURES=tests -DVCPKG_MANIFEST_INSTALL=OFF
    echo "== rebuilding acecode-desktop with fresh embedded assets =="
    "$CMAKE_BIN" --build "$build_dir" --target acecode-desktop
    echo "$current_hash" > "$embed_marker"
else
    echo "== embedded assets already fresh (dist hash matches $embed_marker) =="
fi

# ---------------------------------------------------------------------------
# Assemble portable layout
# ---------------------------------------------------------------------------
validate_models_dev_registry() {
    local registry_dir="$1"
    local file_count
    file_count="$(find "$registry_dir" -type f | wc -l | tr -d '[:space:]')"
    if [[ "$file_count" != "3" ]]; then
        echo "Expected exactly 3 models.dev files in $registry_dir, found $file_count" >&2
        exit 1
    fi
    for f in api.json MANIFEST.json LICENSE; do
        if [[ ! -f "$registry_dir/$f" ]] ||
           ! cmp -s "$repo_root/assets/models_dev/$f" "$registry_dir/$f"; then
            echo "Missing or mismatched models.dev file: $registry_dir/$f" >&2
            exit 1
        fi
    done
}

echo "== assembling $package_dir =="
if [[ -d "$package_dir" ]]; then
    mv "$package_dir" "/tmp/portable-pkg-$(date +%s)"
fi
mkdir -p "$package_dir"

if [[ ! -f "$build_dir/acecode" ]]; then
    echo "ERROR: terminal executable missing: $build_dir/acecode (run the build above again)" >&2
    exit 1
fi
cp "$build_dir/acecode" "$package_dir/"
cp README.md README_CN.md "$package_dir/"

"$CMAKE_BIN" --install "$build_dir" --prefix "$package_dir" --component models_dev_registry >/dev/null
"$CMAKE_BIN" --install "$build_dir" --prefix "$package_dir" --component default_seed_bundle >/dev/null
validate_models_dev_registry "$package_dir/share/acecode/models_dev"
python3 "$repo_root/scripts/verify_seed_bundle.py" \
    --source "$repo_root/assets/seed" \
    --packaged "$package_dir/share/acecode/seed"

if [[ ! -d "$build_dir/ACECode.app" ]]; then
    echo "ERROR: desktop app bundle missing: $build_dir/ACECode.app" >&2
    exit 1
fi
cp -R "$build_dir/ACECode.app" "$package_dir/"

legacy="$(find "$package_dir" -maxdepth 1 -iname 'ace-browser-*' -print -quit)"
if [[ -n "$legacy" ]]; then
    echo "ERROR: legacy browser artifact must not be packaged: $legacy" >&2
    exit 1
fi

echo "== zipping with ditto =="
rm -f "$output_path"
( cd "$repo_root/dist" && /usr/bin/ditto -c -k --keepParent --sequesterRsrc \
    "$package_name" "$(basename "$output_path")" )

# ---------------------------------------------------------------------------
# GUARD 3: verify the freshly built binary actually contains embedded UI.
# `strings` drops non-ASCII, so grep the binary directly for a dist-only token.
# ---------------------------------------------------------------------------
echo "== verifying archive =="
verify_root="$(mktemp -d)"
trap 'rm -rf -- "$verify_root"' EXIT
/usr/bin/ditto -x -k "$output_path" "$verify_root"
extracted="$verify_root/$package_name"

[[ -x "$extracted/acecode" ]] || { echo "extracted acecode not executable" >&2; exit 1; }
[[ -x "$extracted/ACECode.app/Contents/MacOS/ACECode" ]] || { echo "extracted app main missing" >&2; exit 1; }
[[ -x "$extracted/ACECode.app/Contents/MacOS/acecode-daemon" ]] || { echo "extracted daemon missing" >&2; exit 1; }
if ! grep -aq "provider-logos" "$extracted/acecode"; then
    echo "ERROR: built binary does NOT contain embedded web UI (provider-logos absent)." >&2
    echo "       The embed step silently fell back to an empty asset map. Reconfigure cmake." >&2
    exit 1
fi
validate_models_dev_registry "$extracted/share/acecode/models_dev"
validate_models_dev_registry "$extracted/ACECode.app/Contents/Resources/share/acecode/models_dev"
python3 "$repo_root/scripts/verify_seed_bundle.py" \
    --source "$repo_root/assets/seed" --packaged "$extracted/share/acecode/seed"
python3 "$repo_root/scripts/verify_seed_bundle.py" \
    --source "$repo_root/assets/seed" \
    --packaged "$extracted/ACECode.app/Contents/Resources/share/acecode/seed"

echo "== done =="
du -sh "$package_dir" | cat
ls -lh "$output_path" | cat
shasum -a 256 "$output_path" | cat
echo "OK: $output_path"
