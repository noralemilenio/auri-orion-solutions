import contextlib
import io
import json
import tempfile
import unittest
from pathlib import Path

from csv_preflight import inspect_csv, main


class CsvPreflightTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.path = Path(self.tmp.name) / "sample.csv"

    def write(self, content, *, encoding="utf-8"):
        self.path.write_text(content, encoding=encoding)

    def codes(self, result):
        return [item["code"] for item in result["findings"]]

    def test_clean(self):
        self.write("id,name\n1,Ana\n2,Ale\n")
        r = inspect_csv(self.path, required=("name",), unique=("id",))
        self.assertEqual((r["status"], r["rows"], r["columns"]), ("PASS", 2, 2))

    def test_missing_file(self):
        self.assertIn("FILE_READ_ERROR", self.codes(inspect_csv(self.path)))

    def test_empty_file(self):
        self.write("")
        self.assertIn("EMPTY_FILE", self.codes(inspect_csv(self.path)))

    def test_utf8_bom(self):
        self.write("id,nombre\n1,Álvaro\n", encoding="utf-8-sig")
        self.assertEqual(inspect_csv(self.path, required=("id",))["status"], "PASS")

    def test_semicolon(self):
        self.write("id;name\n1;Ana\n")
        self.assertEqual(inspect_csv(self.path, delimiter=";")["status"], "PASS")

    def test_invalid_delimiter(self):
        self.write("a,b\n1,2\n")
        self.assertIn("INVALID_DELIMITER", self.codes(inspect_csv(self.path, delimiter="::")))

    def test_missing_required_header(self):
        self.write("a,b\n1,2\n")
        r = inspect_csv(self.path, required=("missing",))
        self.assertEqual(r["status"], "ERROR")
        self.assertIn("CONFIG_COLUMN_NOT_FOUND", self.codes(r))

    def test_blank_header(self):
        self.write("id, ,name\n1,2,Ana\n")
        self.assertIn("BLANK_HEADER", self.codes(inspect_csv(self.path)))

    def test_duplicate_header(self):
        self.write("id,id\n1,2\n")
        self.assertEqual(inspect_csv(self.path)["status"], "ERROR")

    def test_case_collision_header(self):
        self.write("id,ID\n1,2\n")
        self.assertIn("CASE_COLLISION_HEADER", self.codes(inspect_csv(self.path)))

    def test_short_row(self):
        self.write("id,name\n1\n")
        self.assertIn("COLUMN_COUNT_MISMATCH", self.codes(inspect_csv(self.path)))

    def test_long_row(self):
        self.write("id,name\n1,Ana,extra\n")
        self.assertIn("COLUMN_COUNT_MISMATCH", self.codes(inspect_csv(self.path)))

    def test_required_empty(self):
        self.write("id,name\n1, \n")
        self.assertIn("REQUIRED_EMPTY", self.codes(inspect_csv(self.path, required=("name",))))

    def test_duplicate_unique(self):
        self.write("id,name\n1,Ana\n1,Ale\n")
        self.assertIn("DUPLICATE_KEY", self.codes(inspect_csv(self.path, unique=("id",))))

    def test_formula(self):
        self.write("id,note\n1,=HYPERLINK(\"x\")\n")
        self.assertIn("POTENTIAL_FORMULA", self.codes(inspect_csv(self.path)))

    def test_formula_no_value_leak(self):
        self.write("id,note\n1,=SENSITIVE_PRIVATE_STRING\n")
        r = inspect_csv(self.path)
        self.assertNotIn("SENSITIVE_PRIVATE_STRING", json.dumps(r))

    def test_bad_encoding(self):
        self.path.write_bytes(b"id,name\n1,\xff\n")
        self.assertIn("ENCODING_ERROR", self.codes(inspect_csv(self.path)))

    def test_broken_quote(self):
        self.write('id,name\n1,"unterminated\n')
        self.assertIn("CSV_PARSE_ERROR", self.codes(inspect_csv(self.path)))

    def test_max_bytes(self):
        self.write("id,name\n1,Ana\n")
        self.assertIn("FILE_TOO_LARGE", self.codes(inspect_csv(self.path, max_bytes=5)))

    def test_max_rows(self):
        self.write("id\n1\n2\n")
        self.assertIn("ROW_LIMIT_EXCEEDED", self.codes(inspect_csv(self.path, max_rows=1)))

    def test_findings_cap(self):
        self.write("id,name\n" + "1,=bad\n" * 110)
        r = inspect_csv(self.path, unique=("id",))
        self.assertEqual(len(r["findings"]), 100)
        self.assertGreater(r["suppressed_findings"], 0)

    def test_cli_json_exit_warn(self):
        self.write("id,note\n1,=DANGEROUS\n")
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            code = main([str(self.path), "--json"])
        self.assertEqual(code, 1)
        self.assertEqual(json.loads(out.getvalue())["status"], "WARN")

    def test_cli_exit_clean(self):
        self.write("id,name\n1,Ana\n")
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            code = main([str(self.path), "--required", "name"])
        self.assertEqual(code, 0)


if __name__ == "__main__":
    unittest.main()
