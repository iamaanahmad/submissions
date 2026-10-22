"""Checks the private Zetaris import boundary without contacting a provider."""

import json
import os
import threading
import unittest
import urllib.error
import urllib.request
from unittest.mock import patch
from http.server import ThreadingHTTPServer

from server import Handler


class ZetarisImportTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.url = f"http://127.0.0.1:{cls.server.server_port}/api/zetaris/import"

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()

    def request(self):
        request = urllib.request.Request(self.url, data=b"", method="POST")
        try:
            with urllib.request.urlopen(request) as response:
                return response.status, json.load(response)
        except urllib.error.HTTPError as error:
            return error.code, json.load(error)

    def test_missing_configuration_returns_clear_error(self):
        with patch.dict(os.environ, {}, clear=True):
            status, payload = self.request()
        self.assertEqual(status, 503)
        self.assertIn("not configured", payload["error"])

    def test_configured_import_returns_rows_without_token(self):
        with patch.dict(os.environ, {"ZETARIS_GRANTS_QUERY": "SELECT * FROM grant_view", "ZETARIS_ID_TOKEN": "private-test-token"}):
            with patch("server.fetch_grants", return_value=[{"id": "grant-1"}]) as fetch:
                status, payload = self.request()
        self.assertEqual(status, 200)
        self.assertEqual(payload, {"grants": [{"id": "grant-1"}], "source": "zetaris"})
        self.assertNotIn("private-test-token", json.dumps(payload))
        fetch.assert_called_once_with("SELECT * FROM grant_view")


if __name__ == "__main__":
    unittest.main()
