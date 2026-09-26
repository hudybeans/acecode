import argparse
import subprocess
import sys
import os
from pathlib import Path

from scripts.build_lock import BuildDirectoryBusy, build_directory_lock

# Python launcher that runs `cmake -S . -B build/windows-x64-dev` with the
# full MSVC + Windows SDK environment injected directly (no reliance on
# vcvars64.bat, because reg.exe is blacklisted by the security policy and
# causes vcvars to hang/fail).
#
# The vcpkg toolchain file must be passed so find_package() locates the
# manifest-installed packages under vcpkg_installed/<triplet>/.

cmake = r"C:\dev\tools\cmake-3.31.6-windows-x86_64\bin\cmake.exe"
ninja = r"C:\dev\tools\ninja"
VCPKG_ROOT = r"C:\dev\tools\vcpkg"

# --- Inject MSVC + Windows SDK environment (mirrors run_vcpkg_install.py) ---
SDK = r"C:\Program Files (x86)\Windows Kits\10"
SDK_VER = r"10.0.26100.0"
SDK_BIN = SDK + r"\bin\\" + SDK_VER + r"\x64"
SDK_INC = SDK + r"\Include\\" + SDK_VER
SDK_LIB = SDK + r"\Lib\\" + SDK_VER
MSVC = r"C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Tools\MSVC\14.44.35207"
MSVC_BIN = MSVC + r"\bin\Hostx64\x64"
MSVC_INC = MSVC + r"\include"
MSVC_LIB = MSVC + r"\lib\x64"

env = dict(os.environ)

def prepend(name, dirs):
    cur = env.get(name, "")
    parts = [d for d in dirs if d and d not in cur]
    if parts:
        env[name] = ";".join(parts) + (";" + cur if cur else "")

prepend("PATH", [SDK_BIN, MSVC_BIN, cmake, ninja])
prepend("LIB", [MSVC_LIB, SDK_LIB + r"\ucrt\x64", SDK_LIB + r"\um\x64"])
# `winrt` and `cppwinrt` are required by the desktop WebView2 host: wrl.h and
# EventToken.h live there, not under um/ or shared/.
prepend("INCLUDE", [MSVC_INC, SDK_INC + r"\ucrt", SDK_INC + r"\um",
                    SDK_INC + r"\shared", SDK_INC + r"\winrt", SDK_INC + r"\cppwinrt"])

# vcpkg config for manifest-mode find_package
env["VCPKG_ROOT"] = VCPKG_ROOT
env["VCPKG_DEFAULT_TRIPLET"] = "x64-windows-static"

def parse_args():
    parser = argparse.ArgumentParser(description="Configure the ACECode development build tree.")
    parser.add_argument(
        "--build-dir", type=Path, default=Path("build/windows-x64-dev"),
        help="CMake build directory (default: build/windows-x64-dev)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="print the configure command without executing it or acquiring the build lock",
    )
    return parser.parse_args()


args = parse_args()
repo_root = Path(__file__).resolve().parent
build_dir = args.build_dir if args.build_dir.is_absolute() else repo_root / args.build_dir
build_dir = build_dir.resolve()

cmd = [
    cmake, "-S", str(repo_root), "-B", str(build_dir),
    "-G", "Ninja",
    "-DCMAKE_BUILD_TYPE=Release",
    "-DCMAKE_TOOLCHAIN_FILE=" + VCPKG_ROOT + r"\scripts\buildsystems\vcpkg.cmake",
    "-DVCPKG_ROOT=" + VCPKG_ROOT,
    "-DVCPKG_TARGET_TRIPLET=x64-windows-static",
    "-DVCPKG_MANIFEST_MODE=ON",
    "-DVCPKG_MANIFEST_FEATURES=tests",
    "-DVCPKG_OVERLAY_PORTS=" + str(repo_root / "ports"),
    "-DBUILD_TESTING=ON",
    "-DACECODE_BUILD_DESKTOP=ON",
]

print("Build directory:", build_dir)
print("Lock:", build_dir / ".acecode-build.lock")
if args.dry_run:
    print("DRY RUN: no commands will be executed and no files will be changed.")
    print("Would run:", " ".join('"' + c + '"' if " " in c else c for c in cmd))
    sys.exit(0)
print("Running:", " ".join('"' + c + '"' if " " in c else c for c in cmd))
try:
    with build_directory_lock(build_dir):
        p = subprocess.run(cmd, capture_output=True, encoding="gbk", errors="replace",
                           shell=False, env=env, cwd=str(repo_root))
except BuildDirectoryBusy as error:
    print(f"ERROR: {error}", file=sys.stderr)
    sys.exit(3)
print("=== OUTPUT (first 3000) ===")
print((p.stdout or "")[:3000])
print((p.stderr or "")[:3000])
print("=== OUTPUT (last 8000) ===")
print((p.stdout or "")[-8000:])
print((p.stderr or "")[-3000:])
print("RETURNCODE:", p.returncode)
sys.exit(p.returncode)
