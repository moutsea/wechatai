"""Exercise the installer's and relay's real HTTP requests without user credentials."""
import importlib.util
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
import unittest


def load(name):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(name + ".py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


installer = load("connect")
transport = load("transport")


class HttpTests(unittest.TestCase):
    def setUp(self):
        self.received = []
        received = self.received

        class Handler(BaseHTTPRequestHandler):
            def handle_request(self):
                body = self.rfile.read(int(self.headers.get("Content-Length", "0")))
                received.append((self.path, self.command, self.headers, body))
                # Reproduce the production edge rejecting the default urllib signature.
                if not self.headers.get("User-Agent", "").startswith("Wechatai-Hermes/"):
                    self.send_response(403)
                    self.end_headers()
                    return
                if self.path.endswith("/redirect"):
                    self.send_response(302)
                    self.send_header("Location", "/unexpected-redirect-target")
                    self.end_headers()
                    return
                self.send_response(200)
                self.end_headers()
                self.wfile.write(b'{"ok":true}')

            do_GET = handle_request
            do_POST = handle_request

            def log_message(self, *_):
                pass

        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.thread = Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.endpoint = "http://127.0.0.1:" + str(self.server.server_port)
        self.account = {"endpoint": self.endpoint, "token": "test-only-credential"}

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()

    def test_download_pair_and_relay_pass_client_signature_check(self):
        self.assertEqual(json.loads(installer.fetch(self.endpoint + "/archive.tgz")), {"ok": True})
        self.assertEqual(json.loads(installer.fetch(self.endpoint + "/pair", {"proof": "test-proof"}, self.account["token"])), {"ok": True})
        for action in ("heartbeat", "poll", "claim", "event"):
            self.assertEqual(transport.request(self.account, action, {"text": "中文"}), {"ok": True})
        self.assertEqual(self.received[0][1], "GET")
        self.assertIsNone(self.received[0][2].get("Authorization"))
        for path, method, headers, body in self.received[1:]:
            with self.subTest(path=path):
                self.assertEqual(method, "POST")
                self.assertEqual(headers["Authorization"], "Bearer test-only-credential")
                self.assertEqual(headers["Content-Type"], "application/json")
                self.assertEqual(json.loads(body), {"proof": "test-proof"} if path == "/pair" else {"text": "中文"})

    def test_installer_does_not_redirect_credentials(self):
        with self.assertRaisesRegex(RuntimeError, "HTTP 302"):
            installer.fetch(self.endpoint + "/redirect", {}, self.account["token"])
        self.assertEqual(len(self.received), 1)

    def test_relay_does_not_redirect_credentials(self):
        with self.assertRaises(transport.RelayError) as error:
            transport.request(self.account, "redirect", {})
        self.assertEqual(error.exception.status, 302)
        self.assertEqual(len(self.received), 1)


if __name__ == "__main__":
    unittest.main()
