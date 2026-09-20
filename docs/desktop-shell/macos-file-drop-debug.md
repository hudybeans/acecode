# Local macOS file-drop verification

The coordinate-based Finder drop fix is implemented and archived. Its design,
platform impact, diagnostic policy, and regression checklist are documented in
[`macos-file-drop.md`](macos-file-drop.md). A browser-only test cannot validate
Finder/AppKit events. No GitHub push or signing is needed to build a local app.
Do not overwrite the installed application for this test.

## Prerequisites

The current test machine is Intel macOS 15.7.9. For Intel use
`build/macos-x64-release`, triplet `x64-osx`, architecture `x86_64`, and script
option `--arch x64` in the commands below. The arm64 commands apply to the other Mac.

Run in a native terminal on the test Mac:

```sh
uname -m
sw_vers
xcode-select -p
xcrun --show-sdk-version
clang --version
cmake --version
ninja --version
node --version
pnpm --version
git submodule status
```

M5 should report `arm64`. Use a current Xcode/Command Line Tools compatible
with macOS 26. Install missing CMake/Ninja/Node/pnpm with your normal package
manager. Use Node 22 or newer. Initialize missing submodules:

```sh
git submodule update --init --recursive
```

Install/bootstrap vcpkg if absent, then set `VCPKG_ROOT` to that checkout.
The portable packaging script assumes dependencies already exist and uses
`VCPKG_MANIFEST_INSTALL=OFF`; the initial configure below explicitly installs
them. Use a separate arm64 build directory, never reuse an Intel cache.

## First build

From the repository root:

```sh
(cd web && pnpm install --frozen-lockfile && pnpm test && pnpm build)

cmake -S . -B build/macos-arm64-release -G Ninja \
  -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_TOOLCHAIN_FILE="$VCPKG_ROOT/scripts/buildsystems/vcpkg.cmake" \
  -DVCPKG_TARGET_TRIPLET=arm64-osx \
  -DVCPKG_OVERLAY_PORTS="$PWD/ports" \
  -DCMAKE_OSX_ARCHITECTURES=arm64 \
  -DACECODE_BUILD_DESKTOP=ON -DBUILD_TESTING=OFF \
  -DVCPKG_MANIFEST_FEATURES=tests -DVCPKG_MANIFEST_INSTALL=ON

bash scripts/macos_create_portable_zip.sh drag-drop-fix --arch arm64
```

For subsequent changes, rebuild `web/dist` and rerun the portable script. It
refreshes configure-time embedded frontend assets and incrementally builds C++.
The ZIP is optional for local interaction testing; the staged app is runnable.

Fully quit the previous ACECode instance (closing its window may leave it in the
tray). Then:

```sh
open "$PWD/dist/acecode-macos-arm64/ACECode.app"
```

Normal app startup uses the existing user profile; portable does not mean an
isolated profile. Do not run simultaneous old/new desktop instances.

## Diagnostics

Native and frontend logs share `[file-drop]`. With the default user data root:

```sh
grep -h '\[file-drop\]' "$HOME"/.acecode/logs/desktop* | tail -150
```

If the data root is customized, use its `logs` directory instead. Normal logs
contain one installation status and one final `drop-result`; rejected drops may
also report an invalid coordinate, ineligible/disabled/covered target, missing
receiver, materialization failure, or fixed-enum receiver exception. They do not
contain full paths, filenames, file contents, composer input, key values, or
exception text. Record the test time and report these lines rather than entire
logs, which can contain unrelated private data.

- Check typing first: click the composer, type ASCII and Chinese, then paste.
- Installation but no final result: check actual AppKit delivery, bridge, and frontend version.
- `invalid-coordinate`: inspect WebView bounds conversion and flipped Y handling.
- `ineligible-target`: confirm the release point, overlay marker, and disabled state.
- A successful composer result has `accepted:true`, `target:"composer"`, and `failed:false`.

The desktop can detect the repository and serve filesystem `web/dist` instead
of embedded assets. Check the startup `dev mode: serving web/` log when comparing
builds. Fully restart for native code changes. Do not assume an old binary uses
an old frontend if it serves the same dist directory.

## Manual matrix

Use Finder with a local `.txt` first. Test immediate release and a three-second
hover, then multi-file, folder, Unicode/space filenames, home and existing chat,
terminal, crossing child elements, leaving the window, Escape cancellation,
disabled input and drops over sidebar/preview/modal. Verify one insertion only,
no `file://` navigation, and feedback clearing. Recheck text/Slate drags.
Cloud file promises from Mail/Photos are not covered by the local file-URL fix.

JS tests do not cover actual AppKit delivery. A successful frontend build
does not establish native compilation or macOS 26 compatibility.
