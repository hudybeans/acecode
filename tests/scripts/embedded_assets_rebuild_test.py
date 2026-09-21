"""Verify that rebuilding after a Vite output change refreshes embedded bytes."""
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]


class EmbeddedAssetsRebuildTest(unittest.TestCase):
    @unittest.skipUnless(shutil.which("cmake") and shutil.which("ninja"), "requires CMake and Ninja")
    def test_modified_asset_reconfigures_without_changing_its_filename(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "source"
            build = Path(directory) / "build"
            source.mkdir()
            web = source / "web"
            web.mkdir()
            index = web / "index.html"
            index.write_text("before", encoding="utf-8")
            module = (ROOT / "cmake/acecode_embed_assets.cmake").as_posix()
            (source / "CMakeLists.txt").write_text(
                'cmake_minimum_required(VERSION 3.16)\nproject(embed_test NONE)\n'
                f'include("{module}")\n'
                'acecode_generate_embedded_assets("${CMAKE_SOURCE_DIR}/web" '
                '"${CMAKE_BINARY_DIR}/embedded.cpp" "test")\n', encoding="utf-8")

            def run(*args):
                result = subprocess.run(["cmake", *args], capture_output=True, text=True)
                self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

            run("-S", str(source), "-B", str(build), "-G", "Ninja")
            generated = build / "embedded.cpp"
            self.assertIn("0x62,0x65,0x66,0x6f,0x72,0x65,", generated.read_text())
            index.write_text("after", encoding="utf-8")
            run("--build", str(build))
            self.assertIn("0x61,0x66,0x74,0x65,0x72,", generated.read_text())
            self.assertNotIn("0x62,0x65,0x66,0x6f,0x72,0x65,", generated.read_text())


if __name__ == "__main__":
    unittest.main()
