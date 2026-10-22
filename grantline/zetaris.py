"""Read a grant view through a configured Zetaris OpenSqlQuery endpoint.

The endpoint is supplied by the operator because each Zetaris instance has its
own URI. This module makes no query until an instance and bearer token exist.
"""

from __future__ import annotations

import json
import os
import urllib.request
from urllib.parse import urlparse


def fetch_grants(query: str) -> list[dict]:
    endpoint = os.environ.get("ZETARIS_OPEN_SQL_URL", "").strip()
    token = os.environ.get("ZETARIS_ID_TOKEN", "").strip()
    if not endpoint or not token:
        raise RuntimeError("Zetaris instance endpoint and ID token are required.")
    url = urlparse(endpoint)
    if url.scheme != "https" or not url.netloc:
        raise ValueError("Zetaris query endpoint must use HTTPS.")
    normalized = query.strip()
    if not normalized.upper().startswith("SELECT ") or ";" in normalized:
        raise ValueError("Only a read-only SELECT query is supported.")
    body = json.dumps({"select": query, "pageLimit": 100}).encode()
    request = urllib.request.Request(endpoint, data=body, headers={
        "Authorization": f"Bearer {token}", "Content-Type": "application/json"
    }, method="POST")
    with urllib.request.urlopen(request, timeout=20) as response:
        payload = json.load(response)
    if isinstance(payload, list):
        rows = payload
    elif isinstance(payload, dict):
        rows = payload.get("rows") or payload.get("data") or payload.get("results")
    else:
        rows = None
    if not isinstance(rows, list) or not all(isinstance(row, dict) for row in rows):
        raise ValueError("Unexpected Zetaris response shape. Inspect it privately before changing the adapter.")
    return rows
