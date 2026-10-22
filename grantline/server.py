"""Local Grantline demo server. No account, external service, or API key required."""

from __future__ import annotations

import json
from datetime import date, timedelta
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse
from urllib.error import HTTPError, URLError

from agent import analyze
from zetaris import fetch_grants


ROOT = Path(__file__).resolve().parent
DEMO_ORGANIZATION = {"name": "Harbor Food Network", "region": "California", "focus": "food access, youth", "funding_need": 25000}


def demo_records() -> list[dict]:
    """Clearly fictional records for feature demonstration, never grant leads."""
    future = date.today()
    return [
        {"id": "demo-101", "title": "Neighborhood food access fund", "funder": "Sample Community Trust", "source_url": "https://example.org/demo/food", "deadline": (future + timedelta(days=36)).isoformat(), "regions": "California", "focus": "food access, health", "amount": 30000},
        {"id": "demo-102", "title": "Youth pantry innovation", "funder": "Sample Civic Fund", "source_url": "https://example.org/demo/youth", "deadline": (future + timedelta(days=18)).isoformat(), "regions": "California, Oregon", "focus": "youth, food access", "amount": 12000},
        {"id": "demo-103", "title": "Regional art grant", "funder": "Sample Arts Board", "source_url": "https://example.org/demo/arts", "deadline": (future + timedelta(days=45)).isoformat(), "regions": "Oregon", "focus": "arts", "amount": 80000},
        {"id": "demo-104", "title": "Past food relief round", "funder": "Sample Community Trust", "source_url": "https://example.org/demo/past", "deadline": (future - timedelta(days=5)).isoformat(), "regions": "California", "focus": "food access", "amount": 15000},
        {"id": "demo-101", "title": "Neighborhood food access fund", "funder": "Sample Community Trust", "source_url": "https://example.org/demo/food", "deadline": (future + timedelta(days=36)).isoformat(), "regions": "California", "focus": "food access, health", "amount": 30000},
    ]


class Handler(BaseHTTPRequestHandler):
    def _reply(self, code: int, content: bytes, kind: str = "application/json") -> None:
        self.send_response(code)
        self.send_header("Content-Type", f"{kind}; charset=utf-8")
        self.send_header("Content-Length", str(len(content)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(content)

    def do_GET(self) -> None:
        path = urlparse(self.path).path
        if path == "/":
            self._reply(200, (ROOT / "index.html").read_bytes(), "text/html")
        elif path == "/app.js":
            self._reply(200, (ROOT / "app.js").read_bytes(), "text/javascript")
        elif path == "/style.css":
            self._reply(200, (ROOT / "style.css").read_bytes(), "text/css")
        elif path == "/api/demo":
            body = {"organization": DEMO_ORGANIZATION, "grants": demo_records(), "sample": True}
            self._reply(200, json.dumps(body).encode())
        elif path == "/health":
            self._reply(200, b'{"ok":true}')
        else:
            self._reply(404, b'{"error":"Not found"}')

    def do_POST(self) -> None:
        path = urlparse(self.path).path
        if path == "/api/zetaris/import":
            import os
            query = os.environ.get("ZETARIS_GRANTS_QUERY", "").strip()
            if not query:
                self._reply(503, b'{"error":"Zetaris grant view is not configured."}')
                return
            try:
                rows = fetch_grants(query)
                if not rows or len(rows) > 500:
                    raise ValueError("Zetaris grant view must return 1 to 500 records.")
                self._reply(200, json.dumps({"grants": rows, "source": "zetaris"}).encode())
            except (RuntimeError, ValueError, HTTPError, URLError, TimeoutError):
                self._reply(502, b'{"error":"Zetaris import failed. Check the private connection and grant view."}')
            return
        if path != "/api/analyze":
            self._reply(404, b'{"error":"Not found"}')
            return
        length = int(self.headers.get("Content-Length", "0"))
        if length > 1_000_000:
            self._reply(413, b'{"error":"Request too large"}')
            return
        try:
            data = json.loads(self.rfile.read(length))
            report = analyze(data["organization"], data["grants"])
            self._reply(200, json.dumps(report).encode())
        except (KeyError, ValueError, TypeError, json.JSONDecodeError) as exc:
            self._reply(400, json.dumps({"error": str(exc)}).encode())


if __name__ == "__main__":
    import os
    port = int(os.environ.get("PORT", "4178"))
    print(f"Grantline: http://127.0.0.1:{port}", flush=True)
    ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
