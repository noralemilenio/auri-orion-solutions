"""Pruebas sin acceder a ninguna base de datos de producción."""
from __future__ import annotations

import json
from contextlib import closing
from pathlib import Path
import sqlite3
import subprocess
import sys
import tempfile
import unittest

from sqlite_backup_check import check_database

SCRIPT = Path(__file__).with_name("sqlite_backup_check.py")


class SQLiteBackupCheckTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.path = Path(self.tmp.name) / "example.sqlite3"

    def create_db(self):
        with closing(sqlite3.connect(self.path)) as conn:
            with conn:
                conn.execute("CREATE TABLE example (id INTEGER PRIMARY KEY, value TEXT)")
                conn.execute("INSERT INTO example (value) VALUES ('test')")

    def test_valid_database(self):
        self.create_db()
        result = check_database(self.path)
        self.assertEqual(result["status"], "VALID")
        self.assertEqual(result["integrity"], "ok")
        self.assertGreater(result["snapshot_bytes"], 0)

    def test_does_not_change_original_bytes(self):
        self.create_db()
        before = self.path.read_bytes()
        self.assertEqual(check_database(self.path)["status"], "VALID")
        self.assertEqual(self.path.read_bytes(), before)

    def test_missing_database(self):
        result = check_database(self.path)
        self.assertEqual(result["status"], "ERROR")
        self.assertFalse(self.path.exists())

    def test_invalid_header(self):
        self.path.write_bytes(b"not-a-sqlite-database")
        self.assertEqual(check_database(self.path)["status"], "ERROR")

    def test_invalid_timeout(self):
        self.create_db()
        self.assertEqual(check_database(self.path, 0)["status"], "ERROR")

    def test_wal_mode_with_uncheckpointed_data(self):
        connection = sqlite3.connect(self.path)
        try:
            connection.execute("PRAGMA journal_mode=WAL")
            connection.execute("CREATE TABLE wal_example (value TEXT)")
            connection.execute("INSERT INTO wal_example VALUES ('pending checkpoint')")
            connection.commit()
            result = check_database(self.path)
            self.assertEqual(result["status"], "VALID", result)
        finally:
            connection.close()

    def test_cli_json_and_exit_code(self):
        self.create_db()
        completed = subprocess.run(
            [sys.executable, str(SCRIPT), str(self.path), "--json"],
            text=True, capture_output=True, check=False
        )
        self.assertEqual(completed.returncode, 0, completed.stderr)
        self.assertEqual(json.loads(completed.stdout)["status"], "VALID")

    def test_cli_missing_exit_code(self):
        completed = subprocess.run(
            [sys.executable, str(SCRIPT), str(self.path), "--json"],
            text=True, capture_output=True, check=False
        )
        self.assertEqual(completed.returncode, 2)
        self.assertEqual(json.loads(completed.stdout)["status"], "ERROR")


if __name__ == "__main__":
    unittest.main()
