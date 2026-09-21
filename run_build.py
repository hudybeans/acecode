import argparse
import os
import subprocess
import sys
from pathlib import Path

from scripts.build_lock import BuildDirectoryBusy, build_directory_lock

REPO_ROOT = Path(__file__).resolve().parent

# Build launcher: runs `cmake --build build/windows-x64-dev` with the full
# MSVC + Windows SDK environment injected directly (no vcvars, because reg.exe
# is blacklisted). Mirrors run_cmake_configure.py.
#
# Ninja's default parallelism is selected from the host's logical processor
# count. Use --jobs or ACECODE_BUILD_JOBS to override it for memory-constrained
# machines or when other CPU-heavy work is running.

cmake = r"C:\dev\tools\cmake-3.31.6-windows-x86_64\bin\cmake.exe"
ninja = r"C:\dev\tools\ninja"
VCPKG_ROOT = r"C:\dev\tools\vcpkg"

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

env["VCPKG_ROOT"] = VCPKG_ROOT
env["VCPKG_DEFAULT_TRIPLET"] = "x64-windows-static"


def positive_int(value):
    try:
        parsed = int(value)
    except (TypeError, ValueError) as exc:
        raise argparse.ArgumentTypeError("must be a positive integer") from exc
    if parsed < 1:
        raise argparse.ArgumentTypeError("must be a positive integer")
    return parsed


def parse_args():
    parser = argparse.ArgumentParser(
        description="Build an ACECode target with hardware-aware Ninja parallelism."
    )
    parser.add_argument("target", nargs="?", help="optional CMake target")
    parser.add_argument(
        "--build-dir", type=Path, default=Path("build/windows-x64-dev"),
        help="CMake build directory (default: build/windows-x64-dev)",
    )
    parser.add_argument(
        "-j", "--jobs", type=positive_int,
        help="maximum parallel build jobs (overrides ACECODE_BUILD_JOBS and auto-detection)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="print the build command without executing it or acquiring the build lock",
    )
    return parser.parse_args()


def detect_jobs():
    """Return the host's detected logical processor count."""
    return os.cpu_count() or 1


args = parse_args()
environment_jobs = os.environ.get("ACECODE_BUILD_JOBS")
if args.jobs is not None:
    jobs = args.jobs
    jobs_source = "--jobs"
elif environment_jobs is not None:
    try:
        jobs = positive_int(environment_jobs)
    except argparse.ArgumentTypeError as exc:
        print(f"Invalid ACECODE_BUILD_JOBS={environment_jobs!r}: {exc}", file=sys.stderr)
        sys.exit(2)
    jobs_source = "ACECODE_BUILD_JOBS"
else:
    jobs = detect_jobs()
    jobs_source = "auto-detected"

target = args.target
build_dir = args.build_dir
if not build_dir.is_absolute():
    build_dir = Path(__file__).resolve().parent / build_dir
build_dir = build_dir.resolve()

cmd = [cmake, "--build", str(build_dir)]
if target:
    cmd += ["--target", target]
# Ninja controls process-level parallelism; MSVC /MP remains enabled by CMake.
cmd += ["--parallel", str(jobs)]

print(f"Using {jobs} parallel build jobs ({jobs_source}; logical CPUs: {os.cpu_count() or 1})")
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
                           shell=False, env=env, cwd=str(REPO_ROOT))
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
