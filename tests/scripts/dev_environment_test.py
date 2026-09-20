import importlib.util
import json
import os
from pathlib import Path
import sys
import tempfile
import subprocess
import unittest
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
spec = importlib.util.spec_from_file_location("dev_environment", ROOT / "scripts/dev_environment.py")
dev_environment = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = dev_environment
spec.loader.exec_module(dev_environment)


class DevEnvironmentTest(unittest.TestCase):
    def setUp(self):
        environment = patch.object(dev_environment, "ensure_windows_environment", return_value=True)
        environment.start()
        self.addCleanup(environment.stop)

    def make_build(self, root, desktop=False, name="test"):
        build = root / "build" / name
        build.mkdir(parents=True)
        (build / "CMakeCache.txt").write_text(
            "CMAKE_HOME_DIRECTORY:INTERNAL=" + str(root) + "\n"
            "VCPKG_TARGET_TRIPLET:STRING=x64-windows-static\n"
            f"ACECODE_BUILD_DESKTOP:BOOL={'ON' if desktop else 'OFF'}\n",
            encoding="utf-8",
        )
        (build / dev_environment.native_executable_name("acecode")).touch()
        (build / dev_environment.native_executable_name("acecode")).chmod(0o755)
        if desktop:
            (build / dev_environment.native_executable_name("acecode-desktop")).touch()
            (build / dev_environment.native_executable_name("acecode-desktop")).chmod(0o755)
        return build

    def test_web_candidate_prefers_non_desktop_build(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            plain = self.make_build(root, name="plain")
            self.make_build(root, desktop=True, name="desktop")
            with patch.object(dev_environment, "current_commit", return_value="same"), \
                 patch.object(dev_environment, "registered_worktrees", return_value=[root]), \
                 patch.object(dev_environment, "platform_matches", return_value=True):
                candidate = dev_environment.find_compatible_build(root, "web")
            self.assertEqual(candidate.build_dir, plain.resolve())

    def test_candidate_does_not_reuse_another_worktree_build(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "current"
            other = Path(directory) / "other"
            root.mkdir()
            other.mkdir()
            self.make_build(other)
            with patch.object(dev_environment, "registered_worktrees", return_value=[root, other]), \
                 patch.object(dev_environment, "platform_matches", return_value=True):
                self.assertIsNone(dev_environment.find_compatible_build(root, "web"))

    def test_registered_worktrees_parses_porcelain_prefix(self):
        root = Path("C:/work")
        output = "worktree C:/work\nHEAD abc\n\nworktree C:/other\nHEAD def\n"
        completed = subprocess.CompletedProcess([], 0, stdout=output)
        with patch.object(dev_environment.subprocess, "run", return_value=completed):
            self.assertEqual(dev_environment.registered_worktrees(root), [Path("C:/work"), Path("C:/other")])

    def test_desktop_candidate_requires_desktop_configuration_and_executable(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            build = self.make_build(root, desktop=False)
            with patch.object(dev_environment, "current_commit", return_value="same"), \
                 patch.object(dev_environment, "registered_worktrees", return_value=[root]), \
                 patch.object(dev_environment, "platform_matches", return_value=True):
                self.assertIsNone(dev_environment.find_compatible_build(root, "desktop"))
            self.assertTrue((build / dev_environment.native_executable_name("acecode")).exists())

    def test_tui_command_uses_new_windows_terminal(self):
        executable = Path("C:/work/build/acecode.exe")
        with patch.object(dev_environment.os, "name", "nt"):
            command = dev_environment.tui_command(Path("C:/work"), executable)
        self.assertEqual(command, [str(executable)])

    def test_runtime_directory_is_scoped_to_worktree(self):
        root = Path("C:/worktrees/my project")
        with patch.object(dev_environment, "current_commit", return_value="abcdef1234567890"):
            runtime = dev_environment.worktree_runtime_dir(root)
        self.assertEqual(runtime, root / ".acecode/dev-run/my-project-abcdef123456")

    def test_noninteractive_target_selection_fails(self):
        with patch.object(dev_environment.sys, "stdin", None):
            self.assertIsNone(dev_environment.choose_target(None))

    def test_sccache_discovery_prefers_usable_path_and_has_install_hint(self):
        completed = subprocess.CompletedProcess([], 0, stdout="sccache 1.0")
        with patch.object(dev_environment.shutil, "which", return_value="C:/tools/sccache.exe"), \
             patch.object(Path, "is_file", return_value=True), \
             patch.object(dev_environment.subprocess, "run", return_value=completed):
            self.assertEqual(dev_environment.find_sccache(), Path("C:/tools/sccache.exe"))
        self.assertIn("sccache", dev_environment.sccache_install_hint())

    def test_sccache_discovery_rejects_unusable_file(self):
        completed = subprocess.CompletedProcess([], 1, stdout="")
        with patch.object(dev_environment, "sccache_candidates", return_value=[Path("C:/broken/sccache.exe")]), \
             patch.object(Path, "is_file", return_value=True), \
             patch.object(dev_environment.subprocess, "run", return_value=completed):
            self.assertIsNone(dev_environment.find_sccache())

    def test_cache_state_detects_configuration_transition(self):
        with tempfile.TemporaryDirectory() as directory:
            build = Path(directory) / "build"
            cache = Path("C:/tools/sccache.exe")
            self.assertTrue(dev_environment.cache_state_changed(build, cache))
            dev_environment.write_sccache_marker(build, cache)
            self.assertFalse(dev_environment.cache_state_changed(build, cache))
            self.assertTrue(dev_environment.cache_state_changed(build, None))

    def test_sccache_build_failure_disables_only_matching_cache_path(self):
        with tempfile.TemporaryDirectory() as directory:
            build = Path(directory) / "build"
            cache = Path("C:/tools/sccache.exe")
            dev_environment.write_sccache_marker(build, cache, enabled=False)
            self.assertTrue(dev_environment.sccache_disabled_for_build(build, cache))
            self.assertFalse(dev_environment.sccache_disabled_for_build(build, Path("C:/tools/sccache-new.exe")))

    def test_configure_and_build_disables_test_dependencies(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with patch.object(dev_environment.subprocess, "run", return_value=subprocess.CompletedProcess([], 0)) as run, \
                 patch.object(dev_environment, "build_target", return_value=True):
                self.assertEqual(
                    dev_environment.configure_and_build(root, "windows-x64-release", "web"),
                    root / "build/windows-x64-release",
                )
        self.assertEqual(
            run.call_args_list[0].args[0],
            [
                "cmake", "--preset", "windows-x64-release", "-DBUILD_TESTING=OFF",
                "-DCMAKE_C_COMPILER_LAUNCHER=", "-DCMAKE_CXX_COMPILER_LAUNCHER=",
            ],
        )

    def test_existing_build_reconfiguration_targets_candidate_directory(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "source"
            build = self.make_build(root)
            cache = build / "CMakeCache.txt"
            cache.write_text(
                cache.read_text(encoding="utf-8")
                + "CMAKE_TOOLCHAIN_FILE:FILEPATH=C:/vcpkg/toolchain.cmake\n"
                + "VCPKG_OVERLAY_PORTS:STRING=C:/work/ports\n",
                encoding="utf-8",
            )
            with patch.object(dev_environment.subprocess, "run", return_value=subprocess.CompletedProcess([], 0)) as run:
                self.assertTrue(dev_environment.configure_build(root, "windows-x64-release", build, None))
            command = run.call_args.args[0]
            self.assertEqual(command[:5], ["cmake", "-S", str(root), "-B", str(build)])
            self.assertIn("-DCMAKE_TOOLCHAIN_FILE=C:/vcpkg/toolchain.cmake", command)

    def test_newest_web_seed_requires_clean_same_commit_and_uses_newest_output(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve() / "current"
            older = Path(directory).resolve() / "older"
            newer = Path(directory).resolve() / "newer"
            for worktree in (root, older, newer):
                (worktree / "web/dist").mkdir(parents=True)
                (worktree / "web/dist/index.html").write_text("ok", encoding="utf-8")
            os.utime(older / "web/dist/index.html", (1, 1))
            os.utime(newer / "web/dist/index.html", (2, 2))
            with patch.object(dev_environment, "registered_worktrees", return_value=[root, older, newer]), \
                 patch.object(dev_environment, "current_commit", return_value="same"), \
                 patch.object(dev_environment, "web_worktree_is_clean", return_value=True):
                self.assertEqual(dev_environment.newest_web_seed(root), newer / "web/dist/index.html")
            with patch.object(dev_environment, "registered_worktrees", return_value=[root, newer]), \
                 patch.object(dev_environment, "current_commit", return_value="same"), \
                 patch.object(dev_environment, "web_worktree_is_clean", side_effect=lambda item: item != newer):
                self.assertIsNone(dev_environment.newest_web_seed(root))

    def test_seed_web_assets_copies_current_frontend_output(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "current"
            source = Path(directory) / "source"
            (root / "web/src").mkdir(parents=True)
            (root / "web/src/main.js").write_text("source", encoding="utf-8")
            (source / "web/dist").mkdir(parents=True)
            (source / "web/dist/index.html").write_text("output", encoding="utf-8")
            freshness = iter([True, False])
            builder = type("Builder", (), {"web_build_is_stale": staticmethod(lambda _web, _index: next(freshness))})
            with patch.object(dev_environment, "newest_web_seed", return_value=source / "web/dist/index.html"):
                self.assertTrue(dev_environment.seed_web_assets(root, builder))
            self.assertEqual((root / "web/dist/index.html").read_text(encoding="utf-8"), "output")

    def test_sccache_stats_parses_real_nested_shape(self):
        payload = {
            "stats": {
                "cache_hits": {"counts": {"C/C++": 7}, "adv_counts": {"C/C++": 2}},
                "cache_misses": {"counts": {"C/C++": 3}, "adv_counts": {}},
                "cache_errors": {"counts": {"C/C++": 1}, "adv_counts": {}},
                "cache_read_errors": 2,
                "cache_write_errors": 1,
                "dist_errors": 4,
            }
        }
        completed = subprocess.CompletedProcess([], 0, stdout=json.dumps(payload))
        with patch.object(dev_environment.subprocess, "run", return_value=completed):
            self.assertEqual(
                dev_environment.sccache_stats(Path("sccache")),
                {"hits": 9, "misses": 3, "errors": 8},
            )

    def test_main_starts_quick_web_without_rebuilding_existing_daemon(self):
        candidate = dev_environment.BuildCandidate(
            Path("C:/work/build"), Path("C:/work"), Path("C:/work/build/acecode.exe")
        )
        args = type("Args", (), {"target": "web", "build_dir": None, "yes": False, "dry_run": False, "extra": []})()
        with patch.object(dev_environment, "parse_args", return_value=args), \
             patch.object(dev_environment, "project_root", return_value=Path("C:/work")), \
             patch.object(dev_environment, "find_compatible_build", return_value=candidate), \
             patch.object(dev_environment, "launch_quick_web", return_value=0) as launch, \
             patch.object(dev_environment, "build_target") as build, \
             patch.object(dev_environment, "refresh_web_assets") as refresh:
            self.assertEqual(dev_environment.main(), 0)
        launch.assert_called_once_with(Path("C:/work"), candidate, [])
        build.assert_not_called()
        refresh.assert_not_called()

    def test_main_embedded_mode_builds_and_refreshes_assets(self):
        candidate = dev_environment.BuildCandidate(
            Path("C:/work/build"), Path("C:/work"), Path("C:/work/build/acecode.exe")
        )
        args = type("Args", (), {"target": "web", "build_dir": None, "yes": False, "dry_run": False, "extra": ["--embedded"]})()
        with patch.object(dev_environment, "parse_args", return_value=args), \
             patch.object(dev_environment, "project_root", return_value=Path("C:/work")), \
             patch.object(dev_environment, "find_sccache", return_value=None), \
             patch.object(dev_environment, "find_compatible_build", return_value=candidate), \
             patch.object(dev_environment, "cache_state_changed", return_value=False), \
             patch.object(dev_environment, "build_target", return_value=True) as build, \
             patch.object(dev_environment, "refresh_web_assets", return_value=True) as refresh, \
             patch.object(dev_environment, "launch_surface", return_value=0) as launch:
            self.assertEqual(dev_environment.main(), 0)
        build.assert_called_once_with(Path("C:/work"), candidate.build_dir, "web", None, None)
        refresh.assert_called_once_with(Path("C:/work"))
        launch.assert_called_once_with(Path("C:/work"), "web", candidate, False, [])

    def test_quick_web_reuses_healthy_daemon_and_passes_its_port_to_vite(self):
        root = Path("C:/work")
        candidate = dev_environment.BuildCandidate(root / "build", root, root / "build/acecode.exe")
        run_dir = root / ".acecode/dev-run/test"
        with patch.object(dev_environment, "selected_web_runtime_dir", return_value=run_dir), \
             patch.object(dev_environment, "daemon_is_healthy", return_value=True), \
             patch.object(dev_environment, "daemon_port", return_value=38123), \
             patch.object(dev_environment, "launch_vite", return_value=0) as vite, \
             patch.object(dev_environment, "start_quick_web_daemon") as start:
            self.assertEqual(dev_environment.launch_quick_web(root, candidate, []), 0)
        vite.assert_called_once_with(root, 38123, run_dir, [])
        start.assert_not_called()

    def test_quick_web_falls_back_to_system_selected_port(self):
        root = Path("C:/work")
        candidate = dev_environment.BuildCandidate(root / "build", root, root / "build/acecode.exe")
        run_dir = root / ".acecode/dev-run/test"
        with patch.object(dev_environment, "selected_web_runtime_dir", return_value=run_dir), \
             patch.object(dev_environment, "daemon_is_healthy", return_value=False), \
             patch.object(Path, "exists", return_value=False), \
             patch.object(dev_environment, "reserve_loopback_port", return_value=38123), \
             patch.object(dev_environment, "start_quick_web_daemon", side_effect=[None, 38123]) as start, \
             patch.object(dev_environment, "launch_vite", return_value=0) as vite:
            self.assertEqual(dev_environment.launch_quick_web(root, candidate, []), 0)
        self.assertEqual([call.args[3] for call in start.call_args_list], [28080, 38123])
        vite.assert_called_once_with(root, 38123, run_dir, [])

    def test_quick_daemon_start_requires_a_healthy_runtime(self):
        root = Path("C:/work")
        run_dir = root / ".acecode/dev-run/test"
        candidate = dev_environment.BuildCandidate(root / "build", root, root / "build/acecode.exe")
        with patch.object(dev_environment.subprocess, "Popen"), \
             patch.object(dev_environment, "daemon_is_healthy", return_value=False), \
             patch.object(dev_environment, "daemon_port", return_value=28080):
            self.assertIsNone(dev_environment.start_quick_web_daemon(root, candidate, run_dir, 28080))

    def test_healthy_daemon_requires_authenticated_identity_match(self):
        root = Path("C:/work")
        run_dir = root / ".acecode/dev-run/test"
        candidate = dev_environment.BuildCandidate(root / "build", root, root / "build/acecode.exe")
        with tempfile.TemporaryDirectory() as temp:
            runtime = Path(temp) / "runtime"
            runtime.mkdir()
            (runtime / "daemon.pid").write_text("42", encoding="utf-8")
            (runtime / "daemon.port").write_text("38123", encoding="utf-8")
            (runtime / "token").write_text("secret", encoding="utf-8")
            response = type("Response", (), {
                "__enter__": lambda self: self,
                "__exit__": lambda self, *args: None,
                "read": lambda self: b'{"pid": 41, "port": 38123}',
            })()
            with patch.object(dev_environment.urllib.request, "urlopen", return_value=response) as urlopen:
                self.assertFalse(dev_environment.daemon_is_healthy(root, candidate, runtime))
            urlopen.assert_called_once()

    def test_quick_daemon_starts_foreground_worker_with_isolated_runtime(self):
        root = Path("C:/work")
        run_dir = root / ".acecode/dev-run/test"
        candidate = dev_environment.BuildCandidate(root / "build", root, root / "build/acecode.exe")
        with patch.object(dev_environment.subprocess, "Popen") as popen, \
             patch.object(dev_environment, "daemon_is_healthy", return_value=True), \
             patch.object(dev_environment, "daemon_port", return_value=28080):
            self.assertEqual(dev_environment.start_quick_web_daemon(root, candidate, run_dir, 28080), 28080)
        self.assertEqual(popen.call_args.args[0], [
            str(candidate.executable), "daemon", "--foreground",
            "--cwd=C:/work", "--run-dir=C:/work/.acecode/dev-run/test", "--port=28080",
        ])

    def test_launch_vite_passes_daemon_credentials_only_to_child_environment(self):
        root = Path("C:/work")
        run_dir = root / ".acecode/dev-run/test"
        builder = type("Builder", (), {"ensure_node_and_pnpm": staticmethod(lambda: ("node", "pnpm"))})
        with patch.object(dev_environment, "load_web_builder", return_value=builder), \
             patch.object(dev_environment, "daemon_token", return_value="test-token"), \
             patch.object(Path, "is_dir", return_value=True), \
             patch.object(dev_environment.subprocess, "run", return_value=subprocess.CompletedProcess([], 0)) as run:
            self.assertEqual(dev_environment.launch_vite(root, 38123, run_dir, ["--host", "127.0.0.1"]), 0)
        command = run.call_args.args[0]
        environment = run.call_args.kwargs["env"]
        self.assertEqual(command, ["pnpm", "dev", "--host", "127.0.0.1"])
        self.assertEqual(environment["ACECODE_DAEMON_PORT"], "38123")
        self.assertEqual(environment["ACECODE_DAEMON_TOKEN"], "test-token")

    def test_vite_options_strip_daemon_runtime_argument(self):
        self.assertEqual(
            dev_environment.vite_options(["--run-dir", "runtime", "--host", "127.0.0.1"]),
            ["--host", "127.0.0.1"],
        )
        self.assertEqual(
            dev_environment.vite_options(["--run-dir=runtime", "--port", "5174"]),
            ["--port", "5174"],
        )

    def test_launch_vite_refuses_missing_daemon_token(self):
        root = Path("C:/work")
        run_dir = root / ".acecode/dev-run/test"
        with patch.object(dev_environment, "daemon_token", return_value=None), \
             patch.object(dev_environment, "load_web_builder") as builder:
            self.assertEqual(dev_environment.launch_vite(root, 38123, run_dir, []), 1)
        builder.assert_not_called()

    def test_missing_quick_daemon_refuses_noninteractive_build_without_authorization(self):
        args = type("Args", (), {"target": "web", "build_dir": None, "yes": False, "dry_run": False, "extra": []})()
        with patch.object(dev_environment, "parse_args", return_value=args), \
             patch.object(dev_environment, "project_root", return_value=Path("C:/work")), \
             patch.object(dev_environment, "find_compatible_build", return_value=None), \
             patch.object(dev_environment, "default_preset", return_value="windows-x64-release"), \
             patch.object(dev_environment.sys, "stdin", None), \
             patch.object(dev_environment, "configure_and_build") as build:
            self.assertEqual(dev_environment.main(), 1)
        build.assert_not_called()

    def test_confirmation_eof_refuses_configuration(self):
        stdin = type("Stdin", (), {"isatty": staticmethod(lambda: True)})()
        with patch.object(dev_environment.sys, "stdin", stdin), \
             patch("builtins.input", side_effect=EOFError):
            self.assertFalse(dev_environment.ask_to_build("windows-x64-release", "web", False))

    def test_main_retries_failed_sccache_build_without_cache(self):
        candidate = dev_environment.BuildCandidate(Path("C:/work/build"), Path("C:/work"), Path("C:/work/build/acecode.exe"))
        args = type("Args", (), {"target": "web", "build_dir": None, "yes": False, "dry_run": False, "extra": ["--embedded"]})()
        cache = Path("C:/tools/sccache.exe")
        with patch.object(dev_environment, "parse_args", return_value=args), \
             patch.object(dev_environment, "project_root", return_value=Path("C:/work")), \
             patch.object(dev_environment, "find_sccache", return_value=cache), \
             patch.object(dev_environment, "sccache_disabled_for_build", return_value=False), \
             patch.object(dev_environment, "find_compatible_build", return_value=candidate), \
             patch.object(dev_environment, "cache_state_changed", return_value=False), \
             patch.object(dev_environment, "build_target", side_effect=[False, True]) as build, \
             patch.object(dev_environment, "configure_build", return_value=True) as configure, \
             patch.object(dev_environment, "refresh_web_assets", return_value=True), \
             patch.object(dev_environment, "launch_surface", return_value=0):
            self.assertEqual(dev_environment.main(), 0)
        self.assertEqual(build.call_args_list[0].args, (Path("C:/work"), candidate.build_dir, "web", cache, None))
        self.assertEqual(build.call_args_list[1].args, (Path("C:/work"), candidate.build_dir, "web", None, None))
        configure.assert_called_once_with(Path("C:/work"), "windows-x64-release", candidate.build_dir, None)

    def test_web_launch_forwards_the_build_and_isolated_runtime_directory(self):
        candidate = dev_environment.BuildCandidate(
            Path("C:/work/build"), Path("C:/work"), Path("C:/work/build/acecode.exe")
        )
        with patch.object(dev_environment, "worktree_runtime_dir", return_value=Path("C:/work/.acecode/dev-run/test")):
            result = dev_environment.launch_surface(Path("C:/work"), "web", candidate, dry_run=True, extra=[])
        self.assertEqual(result, 0)

    def test_windows_web_launcher_does_not_auto_approve_native_build(self):
        wrapper = (ROOT / "scripts/dev_web.bat").read_text(encoding="utf-8")
        self.assertIn('dev_environment.py" web %*', wrapper)
        self.assertNotIn('dev_environment.py" web --yes %*', wrapper)

    def test_windows_other_target_launchers_auto_approve_initial_configuration(self):
        for target in ("desktop", "tui"):
            wrapper = (ROOT / "scripts" / f"dev_{target}.bat").read_text(encoding="utf-8")
            self.assertIn(f'dev_environment.py" {target} --yes %*', wrapper)

    @unittest.skipUnless(os.name == "nt", "Windows batch wrapper")
    def test_batch_wrapper_delegates_to_python(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "py.bat").write_text("@echo off\necho fake-python-launcher\nexit /b 7\n", encoding="ascii")
            environment = dict(os.environ)
            environment["PATH"] = str(root) + os.pathsep + str(Path(os.environ["SystemRoot"]) / "System32")
            result = subprocess.run(
                [os.environ["COMSPEC"], "/d", "/c", str(ROOT / "scripts/dev_web.bat"), "--help"],
                cwd=root, env=environment, capture_output=True, text=True,
                creationflags=subprocess.CREATE_NO_WINDOW,
            )
            self.assertEqual(result.returncode, 7, result.stdout + result.stderr)
            self.assertIn("fake-python-launcher", result.stdout)


if __name__ == "__main__":
    unittest.main()
