"""Pruebas reproducibles: ZIP generados en memoria temporal, sin datos privados."""
import contextlib
import io
import json
import stat
import tempfile
import unittest
import warnings
import zipfile
from pathlib import Path

from zip_preflight import inspect_zip, main


class ZipPreflightTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.archive = Path(self.temp.name) / "test.zip"

    def make_zip(self, members):
        with zipfile.ZipFile(self.archive, "w", zipfile.ZIP_DEFLATED) as zf:
            for name, data in members:
                zf.writestr(name, data)

    def codes(self, **kwargs):
        return {x["code"] for x in inspect_zip(self.archive, **kwargs)["findings"]}

    def test_clean_metadata_pass(self):
        self.make_zip([("docs/nota.txt", b"hola")])
        self.assertEqual(inspect_zip(self.archive)["status"], "PASS")

    def test_clean_crc_pass(self):
        self.make_zip([("nota.txt", b"hola")])
        report = inspect_zip(self.archive, check_crc=True)
        self.assertEqual((report["status"], report["crc"]), ("PASS", "CHECKED"))

    def test_missing_file_error(self):
        self.assertEqual(inspect_zip(self.archive)["status"], "ERROR")

    def test_corrupt_archive_error(self):
        self.archive.write_bytes(b"esto no es un ZIP")
        self.assertEqual(inspect_zip(self.archive)["status"], "ERROR")

    def test_parent_traversal(self):
        self.make_zip([("../fuera.txt", b"no")])
        self.assertIn("UNSAFE_PATH", self.codes())

    def test_absolute_path(self):
        self.make_zip([("/etc/passwd", b"no")])
        self.assertIn("UNSAFE_PATH", self.codes())

    def test_windows_drive(self):
        self.make_zip([("C:/Users/file.txt", b"no")])
        self.assertIn("UNSAFE_PATH", self.codes())

    def test_backslash_ambiguous(self):
        self.make_zip([("..\\fuera.txt", b"no")])
        self.assertIn("UNSAFE_PATH", self.codes())

    def test_duplicate_name(self):
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", UserWarning)
            self.make_zip([("a.txt", b"uno"), ("a.txt", b"dos")])
        self.assertIn("DUPLICATE_NAME", self.codes())

    def test_case_collision(self):
        self.make_zip([("A.txt", b"uno"), ("a.txt", b"dos")])
        self.assertIn("CASE_COLLISION", self.codes())

    def test_ratio_limit(self):
        self.make_zip([("zeros.txt", b"0" * 100000)])
        self.assertIn("COMPRESSION_RATIO", self.codes(max_ratio=10))

    def test_total_size_limit(self):
        self.make_zip([("nota.txt", b"12345")])
        self.assertIn("TOTAL_SIZE_LIMIT", self.codes(max_total=4))

    def test_file_size_limit(self):
        self.make_zip([("nota.txt", b"12345")])
        self.assertIn("FILE_SIZE_LIMIT", self.codes(max_file=4))

    def test_entry_limit(self):
        self.make_zip([("a", b"1"), ("b", b"2")])
        self.assertIn("TOO_MANY_ENTRIES", self.codes(max_entries=1))

    def test_symlink(self):
        info = zipfile.ZipInfo("link")
        info.create_system = 3
        info.external_attr = (stat.S_IFLNK | 0o777) << 16
        with zipfile.ZipFile(self.archive, "w") as zf:
            zf.writestr(info, "../outside")
        self.assertIn("SYMLINK", self.codes())

    def test_crc_skipped_when_limit(self):
        self.make_zip([("zeros.txt", b"0" * 100000)])
        report = inspect_zip(self.archive, check_crc=True, max_ratio=10)
        self.assertEqual(report["crc"], "SKIPPED_LIMIT_OR_ENCRYPTION")

    def test_cli_json_exit_codes(self):
        self.make_zip([("../bad.txt", b"hola")])
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            code = main([str(self.archive), "--json"])
        self.assertEqual(code, 2)
        self.assertEqual(json.loads(output.getvalue())["status"], "WARN")

    def test_invalid_limits_error(self):
        self.make_zip([("a.txt", b"hola")])
        self.assertEqual(inspect_zip(self.archive, max_entries=0)["status"], "ERROR")


if __name__ == "__main__":
    unittest.main()
