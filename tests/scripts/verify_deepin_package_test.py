import importlib.util
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location(
    "deepin_package", ROOT / "scripts/verify_deepin_package.py")
package = importlib.util.module_from_spec(spec)
spec.loader.exec_module(package)


class DeepinPackageTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)

    def test_application_and_resources_are_allowed(self):
        for name in ("acecode", "acecode-desktop", "acecode-logo.png", "DEEPIN.md"):
            (self.root / name).write_bytes(b"resource")
        package.verify_deepin_package(self.root)

    def test_nested_libraries_and_plugins_are_rejected(self):
        for name in ("libQt5Core.so.5.11.3", "libdtkwidget.so.5",
                     "libdtkgui.so.5.2.0", "libdtkcore.so.5",
                     "libdxcb.so", "libqxcb.so", "libqdeepin.so",
                     "libqsvg.so", "libQt6Core.so.6"):
            with self.subTest(name=name):
                path = self.root / "lib" / "plugins" / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.touch()
                with self.assertRaisesRegex(ValueError, "Bundled Qt/DTK"):
                    package.verify_deepin_package(self.root)
                path.unlink()

    def test_broken_runtime_symlink_is_rejected(self):
        (self.root / "libQt5Gui.so.5").symlink_to("missing-system-library")
        with self.assertRaisesRegex(ValueError, "Bundled Qt/DTK"):
            package.verify_deepin_package(self.root)

    def test_missing_directory_is_an_error(self):
        with self.assertRaisesRegex(ValueError, "Missing package directory"):
            package.verify_deepin_package(self.root / "missing")


if __name__ == "__main__":
    unittest.main()
