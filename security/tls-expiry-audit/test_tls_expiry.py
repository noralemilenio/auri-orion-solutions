"""Pruebas locales sin consultar servicios de terceros."""
import shutil
import ssl
import subprocess
import tempfile
import threading
import unittest
from datetime import datetime, timedelta, timezone
from http.server import HTTPServer
from socketserver import BaseRequestHandler
from pathlib import Path

from tls_expiry import inspect, main, parse_target, read_targets


class Handler(BaseRequestHandler):
    def handle(self):
        self.request.settimeout(1)
        try:
            self.request.recv(1)
        except (OSError, TimeoutError):
            pass


@unittest.skipUnless(shutil.which("openssl"), "Requiere OpenSSL")
class TLSExpiryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        root = Path(cls.tmp.name)
        cls.cert, cls.key = root / "cert.pem", root / "key.pem"
        subprocess.run([
            "openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes",
            "-keyout", str(cls.key), "-out", str(cls.cert),
            "-days", "5", "-subj", "/CN=localhost",
        ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        cls.server = HTTPServer(("127.0.0.1", 0), Handler)
        ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        ctx.load_cert_chain(str(cls.cert), str(cls.key))
        cls.server.socket = ctx.wrap_socket(cls.server.socket, server_side=True)
        cls.port = cls.server.server_port
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=5)
        cls.tmp.cleanup()

    def test_expiring_self_signed_certificate(self):
        result = inspect(f"localhost:{self.port}", 30, 3, "openssl")
        self.assertEqual(result["estado"], "CADUCA_PRONTO", result)
        self.assertTrue(0 < result["dias_restantes"] <= 5)

    def test_valid_with_shorter_warning_window(self):
        result = inspect(f"localhost:{self.port}", 1, 3, "openssl")
        self.assertEqual(result["estado"], "VIGENTE", result)

    def test_expired_relative_to_simulated_future(self):
        now = datetime.now(timezone.utc) + timedelta(days=7)
        result = inspect(f"localhost:{self.port}", 30, 3, "openssl", now=now)
        self.assertEqual(result["estado"], "CADUCADO", result)

    def test_bad_target_rejected(self):
        for target in ("https://example.com", "user@example.com", "host:99999", "host/path"):
            with self.subTest(target=target):
                with self.assertRaises(ValueError):
                    parse_target(target)

    def test_network_error_reported(self):
        result = inspect("127.0.0.1:1", 30, 0.5, "openssl")
        self.assertEqual(result["estado"], "ERROR", result)

    def test_deduplicate_and_comments(self):
        with tempfile.TemporaryDirectory() as temp:
            p = Path(temp) / "hosts.txt"
            p.write_text("# comentario\nlocalhost\nlocalhost\n\nexample.org:8443\n")
            self.assertEqual(read_targets(p), ["localhost", "example.org:8443"])

    def test_cli_exit_code_warning(self):
        with tempfile.TemporaryDirectory() as temp:
            p = Path(temp) / "hosts.txt"
            p.write_text(f"localhost:{self.port}\n")
            self.assertEqual(main(["--file", str(p), "--warn-days", "30", "--json"]), 1)

    def test_cli_exit_code_error(self):
        with tempfile.TemporaryDirectory() as temp:
            p = Path(temp) / "hosts.txt"
            p.write_text("https://no-valido\n")
            self.assertEqual(main(["--file", str(p)]), 2)


if __name__ == "__main__":
    unittest.main()
