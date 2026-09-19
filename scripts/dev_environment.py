#!/usr/bin/env python3
"""Launch ACECode Web, Desktop, or TUI development environments safely."""

from __future__ import annotations

import argparse
import os
import platform
import importlib.util
import re
import shutil
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

TARGETS = ("web", "desktop", "tui")


@dataclass(frozen=True)
class BuildCandidate:
    build_dir: Path
    source_dir: Path
    executable: Path


def project_root() -> Path:
    return Path(__file__).resolve().parent.parent


def native_executable_name(name: str) -> str:
    return f"{name}.exe" if os.name == "nt" else name


def executable_for(build_dir: Path, target: str) -> Path | None:
    name = native_executable_name("acecode-desktop" if target == "desktop" else "acecode")
    candidates = [
        build_dir / name,
        build_dir / "Release" / name,
        build_dir / "Debug" / name,
        build_dir / "RelWithDebInfo" / name,
        build_dir / "MinSizeRel" / name,
    ]
    for path in candidates:
        if path.is_file():
            return path
    if not build_dir.is_dir():
        return None
    matches = sorted(path for path in build_dir.rglob(name) if path.is_file())
    return matches[0] if matches else None


def cmake_cache_value(cache: Path, key: str) -> str | None:
    try:
        pattern = re.compile(rf"^{re.escape(key)}(?::[^=]+)?=(.*)$")
        for line in cache.read_text(encoding="utf-8", errors="replace").splitlines():
            match = pattern.match(line)
            if match:
                return match.group(1)
    except OSError:
        return None
    return None


def cmake_source_dir(build_dir: Path) -> Path | None:
    value = cmake_cache_value(build_dir / "CMakeCache.txt", "CMAKE_HOME_DIRECTORY")
    return Path(value).resolve() if value else None


def configured_for_desktop(build_dir: Path) -> bool:
    return cmake_cache_value(build_dir / "CMakeCache.txt", "ACECODE_BUILD_DESKTOP") == "ON"


def current_commit(root: Path) -> str | None:
    result = subprocess.run(
        ["git", "-C", str(root), "rev-parse", "HEAD"],
        text=True,
        capture_output=True,
        check=False,
    )
    return result.stdout.strip() if result.returncode == 0 else None


def registered_worktrees(root: Path) -> list[Path]:
    result = subprocess.run(
        ["git", "-C", str(root), "worktree", "list", "--porcelain"],
        text=True,
        capture_output=True,
        check=False,
    )
    if result.returncode != 0:
        return []
    return [Path(line[len("worktree "):]).resolve() for line in result.stdout.splitlines() if line.startswith("worktree ")]


def build_directories(worktree: Path, explicit: Path | None = None) -> Iterable[Path]:
    if explicit:
        yield explicit.resolve()
        return
    build_root = worktree / "build"
    if build_root.is_dir():
        yield build_root
        yield from (path for path in build_root.iterdir() if path.is_dir())


def platform_matches(build_dir: Path) -> bool:
    triplet = cmake_cache_value(build_dir / "CMakeCache.txt", "VCPKG_TARGET_TRIPLET")
    if not triplet:
        return True
    system = platform.system().lower()
    expected_system = "windows" if system == "windows" else "osx" if system == "darwin" else "linux"
    machine = platform.machine().lower()
    expected_arch = "arm64" if machine in {"arm64", "aarch64"} else "x64" if machine in {"amd64", "x86_64"} else None
    triplet_lower = triplet.lower()
    return expected_system in triplet_lower and (expected_arch is None or expected_arch in triplet_lower)


def find_compatible_build(root: Path, target: str, explicit: Path | None = None) -> BuildCandidate | None:
    commit = current_commit(root)
    if not commit:
        return None
    worktrees = registered_worktrees(root)
    for worktree in worktrees:
        if current_commit(worktree) != commit:
            continue
        directories = [explicit.resolve()] if explicit else build_directories(worktree)
        for build_dir in directories:
            source_dir = cmake_source_dir(build_dir)
            executable = executable_for(build_dir, target)
            if source_dir != worktree.resolve() or not executable or not platform_matches(build_dir):
                continue
            if target == "desktop" and not configured_for_desktop(build_dir):
                continue
            return BuildCandidate(build_dir.resolve(), source_dir, executable)
    return None


def default_preset(target: str) -> str | None:
    system = platform.system().lower()
    machine = platform.machine().lower()
    arch = "arm64" if machine in {"arm64", "aarch64"} else "x64" if machine in {"amd64", "x86_64"} else None
    if not arch:
        return None
    prefix = {"windows": "windows", "darwin": "macos", "linux": "linux"}.get(system)
    if not prefix:
        return None
    suffix = "-desktop-release" if target == "desktop" else "-release"
    return f"{prefix}-{arch}{suffix}"


def ask_to_build(preset: str, target: str, assume_yes: bool) -> bool:
    binary_dir = f"build/{preset}"
    executable_target = "acecode-desktop" if target == "desktop" else "acecode"
    print("[INFO] No compatible build was found in this repository's registered worktrees.")
    print(f"[INFO] Proposed configure preset: {preset}")
    print(f"[INFO] Proposed build: cmake --build {binary_dir} --target {executable_target}")
    if assume_yes:
        return True
    if not sys.stdin.isatty():
        print("[ERROR] Refusing to compile without interactive confirmation. Re-run with --yes to confirm.", file=sys.stderr)
        return False
    try:
        return input("Configure and build now? [y/N] ").strip().lower() in {"y", "yes"}
    except EOFError:
        print("[ERROR] Confirmation input was unavailable; no configuration or build was started.", file=sys.stderr)
        return False


def build_target(root: Path, build_dir: Path, target: str) -> bool:
    executable_target = "acecode-desktop" if target == "desktop" else "acecode"
    return subprocess.run(
        ["cmake", "--build", str(build_dir), "--target", executable_target],
        cwd=root,
        check=False,
    ).returncode == 0


def configure_and_build(root: Path, preset: str, target: str) -> Path | None:
    if subprocess.run(["cmake", "--preset", preset], cwd=root, check=False).returncode != 0:
        return None
    build_dir = root / "build" / preset
    return build_dir if build_target(root, build_dir, target) else None


def refresh_web_assets(root: Path) -> bool:
    script_path = root / "scripts" / "dev_desktop.py"
    spec = importlib.util.spec_from_file_location("dev_desktop_for_environment", script_path)
    if spec is None or spec.loader is None:
        print("[ERROR] Cannot load Web asset builder.", file=sys.stderr)
        return False
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    try:
        _, pnpm = module.ensure_node_and_pnpm()
        module.build_web(root / "web", pnpm)
    except (OSError, subprocess.SubprocessError, SystemExit):
        return False
    return True


def worktree_runtime_dir(root: Path) -> Path:
    identity = current_commit(root) or root.name
    safe = re.sub(r"[^A-Za-z0-9_.-]", "-", f"{root.name}-{identity[:12]}")
    return root / ".acecode" / "dev-run" / safe


def launch_surface(root: Path, target: str, candidate: BuildCandidate, dry_run: bool, extra: list[str]) -> int:
    if target == "web":
        run_dir = worktree_runtime_dir(root)
        command = [sys.executable, str(root / "scripts" / "dev_web.py"), "--build-dir", str(candidate.build_dir), "--run-dir", str(run_dir), *extra]
        print(f"[INFO] Launching Web with build: {candidate.build_dir}")
        print(f"[INFO] Isolated runtime directory: {run_dir}")
    elif target == "desktop":
        command = [sys.executable, str(root / "scripts" / "dev_desktop.py"), "--build-dir", str(candidate.build_dir), "--no-build", *extra]
        print(f"[INFO] Launching Desktop with build: {candidate.build_dir}")
    else:
        command = tui_command(root, candidate.executable)
        if command is None:
            print(f"[ERROR] Cannot open a new terminal automatically. Run: {candidate.executable}", file=sys.stderr)
            return 1
        print(f"[INFO] Launching TUI in a new terminal with build: {candidate.build_dir}")
    if dry_run:
        print("[INFO] Dry run: " + " ".join(f'"{part}"' if " " in part else part for part in command))
        return 0
    return subprocess.Popen(command, cwd=root).wait() if target == "web" else (subprocess.Popen(command, cwd=root) and 0)


def tui_command(root: Path, executable: Path) -> list[str] | None:
    if os.name == "nt":
        return ["cmd.exe", "/d", "/c", "start", "ACECode TUI", "/d", str(root), str(executable)]
    if sys.platform == "darwin":
        return ["open", "-a", "Terminal", str(executable)]
    for terminal in ("x-terminal-emulator", "gnome-terminal", "konsole", "xterm"):
        path = shutil.which(terminal)
        if path:
            if terminal == "gnome-terminal":
                return [path, "--", str(executable)]
            if terminal == "konsole":
                return [path, "-e", str(executable)]
            return [path, "-e", str(executable)]
    return None


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Start an ACECode development environment")
    parser.add_argument("target", nargs="?", choices=TARGETS, help="development surface to start")
    parser.add_argument("--build-dir", type=Path, help="build directory to validate and use")
    parser.add_argument("--yes", action="store_true", help="confirm a required CMake build")
    parser.add_argument("--dry-run", action="store_true", help="print the selected command without starting it")
    args, extra = parser.parse_known_args()
    args.extra = extra
    return args


def choose_target(target: str | None) -> str | None:
    if target:
        return target
    if not sys.stdin.isatty():
        print("[ERROR] Specify one target: web, desktop, or tui.", file=sys.stderr)
        return None
    selected = input("Choose development target [web/desktop/tui]: ").strip().lower()
    if selected not in TARGETS:
        print("[ERROR] Choose web, desktop, or tui.", file=sys.stderr)
        return None
    return selected


def main() -> int:
    args = parse_args()
    target = choose_target(args.target)
    if not target:
        return 2
    root = project_root()
    candidate = find_compatible_build(root, target, args.build_dir)
    if candidate is None:
        preset = default_preset(target)
        if preset is None:
            print("[ERROR] No supported CMake preset for this platform and architecture.", file=sys.stderr)
            return 1
        if not ask_to_build(preset, target, args.yes):
            return 1
        if args.dry_run:
            print(f"[INFO] Dry run: cmake --preset {preset}")
            return 0
        built = configure_and_build(root, preset, target)
        if not built:
            return 1
        candidate = find_compatible_build(root, target, built)
        if candidate is None:
            print("[ERROR] Build completed but did not produce a compatible executable.", file=sys.stderr)
            return 1
    if not args.dry_run and not build_target(root, candidate.build_dir, target):
        print("[ERROR] Incremental build failed; development environment was not started.", file=sys.stderr)
        return 1
    if target in {"web", "desktop"} and not args.dry_run and not refresh_web_assets(root):
        print("[ERROR] Web asset refresh failed; development environment was not started.", file=sys.stderr)
        return 1
    return launch_surface(root, target, candidate, args.dry_run, args.extra)


if __name__ == "__main__":
    raise SystemExit(main())
