#!/usr/bin/env bash
# Build DTK 5 against the release container's Qt 5.11 / GLIBC 2.28.
# The SDK is used for linking only; Deepin supplies the runtime libraries.
set -euo pipefail

if [ "$#" -ne 2 ] || [[ "$1" != /* ]] || [[ "$2" != /* ]]; then
    echo "Usage: bash scripts/build_deepin_dtk_sdk.sh <absolute-sdk-prefix> <absolute-work-dir>" >&2
    exit 2
fi
sdk_prefix="$1"
sdk_work="$2"
mkdir -p "$sdk_prefix" "$sdk_work"
export QT_SELECT=qt5
export QMAKEPATH="$sdk_prefix${QMAKEPATH:+:$QMAKEPATH}"
export QMAKEFEATURES="$sdk_prefix/mkspecs/features${QMAKEFEATURES:+:$QMAKEFEATURES}"
export PKG_CONFIG_PATH="$sdk_prefix/lib/pkgconfig${PKG_CONFIG_PATH:+:$PKG_CONFIG_PATH}"
export LD_LIBRARY_PATH="$sdk_prefix/lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"

build_module() {
    local module="$1" version="$2" revision="$3" checksum="$4"
    local archive="$sdk_work/$module-$revision.tar.gz"
    local source_dir="$sdk_work/$module-$revision"
    local build_dir="$sdk_work/build-$module"
    curl --fail --location --retry 3 \
        "https://codeload.github.com/linuxdeepin/$module/tar.gz/$revision" \
        --output "$archive"
    printf '%s  %s\n' "$checksum" "$archive" | sha256sum --check --strict
    tar -xzf "$archive" -C "$sdk_work"
    mkdir -p "$build_dir"

    local args=("VERSION=$version" "PREFIX=$sdk_prefix"
        "LIB_INSTALL_DIR=$sdk_prefix/lib"
        "MKSPECS_INSTALL_DIR=$sdk_prefix/mkspecs"
        CONFIG+=release DTK_NO_TRANSLATION=YES)

    (
        cd "$build_dir"
        qmake "$source_dir/src/src.pro" "${args[@]}"
        make -j"${CMAKE_BUILD_PARALLEL_LEVEL:-2}"
        # Some upstream install rules use /etc. Stage everything and copy
        # only the requested SDK prefix, leaving the host configuration alone.
        make install INSTALL_ROOT="$build_dir/stage"
    )
    cp -a "$build_dir/stage$sdk_prefix/." "$sdk_prefix/"
    pkg-config --atleast-version=5.2 "$module"

    # Later modules invoke this host tool. Build it after core configuration
    # has generated dtkcore_config.h, with no reliance on git tag discovery.
    if [ "$module" = dtkcore ]; then
        mkdir -p "$build_dir/os-release"
        (
            cd "$build_dir/os-release"
            qmake "$source_dir/tools/deepin-os-release/deepin-os-release.pro" "${args[@]}"
            make -j"${CMAKE_BUILD_PARALLEL_LEVEL:-2}"
            make install INSTALL_ROOT="$build_dir/stage"
        )
        cp -a "$build_dir/stage$sdk_prefix/." "$sdk_prefix/"
    fi
}

# Immutable upstream revisions from DTK's Qt 5.11-compatible release series.
build_module dtkcore 5.2.2.5 ca1e23ddfb9d197faee88c428d1912aad714c743 \
    2d2a5924caaf931f127b24c1e0ce1ba5199cce61ded9071a4ff011ba25f738a4
build_module dtkgui 5.2.2.16 de1f742edefee47963515acf63721ffb53193a8b \
    ce4256f0cfe543abb328ac78e8e4b5dfa011aeccf1913d9248c8cb76dea7f409
build_module dtkwidget 5.2.2.16 36d3e769500b05a4901913ee08e4bd9571d1898c \
    25df1e2cda5c4504af13c6a91eccc3d6def6f2e00c72e9904e4778f4259ee2b1

printf 'DTK 5 SDK ready: %s\n' "$sdk_prefix"
