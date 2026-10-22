"""Small, read-only Grants.gov discovery adapter.

Search results are leads. The API does not prove a nonprofit's eligibility.
"""

from __future__ import annotations

import json
from datetime import datetime
from urllib.request import Request, urlopen


BASE = "https://api.grants.gov/v1/api/"


def _post(path: str, body: dict) -> dict:
    request = Request(BASE + path, data=json.dumps(body).encode(), headers={
        "Content-Type": "application/json", "User-Agent": "Grantline/0.1"
    }, method="POST")
    with urlopen(request, timeout=12) as response:
        payload = json.load(response)
    if payload.get("errorcode") != 0 or not isinstance(payload.get("data"), dict):
        raise ValueError("Grants.gov returned an invalid response.")
    return payload["data"]


def search(keyword: str, limit: int = 6) -> list[dict]:
    keyword = keyword.strip()
    if not keyword or len(keyword) > 100 or not 1 <= limit <= 10:
        raise ValueError("Use a search term under 100 characters and at most 10 results.")
    hits = _post("search2", {"rows": limit, "keyword": keyword, "oppStatuses": "posted"}).get("oppHits")
    if not isinstance(hits, list):
        raise ValueError("Grants.gov search results are unavailable.")
    records = []
    for hit in hits[:limit]:
        if not isinstance(hit, dict) or not str(hit.get("id", "")).isdigit():
            continue
        detail = _post("fetchOpportunity", {"opportunityId": int(hit["id"])})
        synopsis = detail.get("synopsis") or {}
        if not isinstance(synopsis, dict):
            synopsis = {}
        raw_date = hit.get("closeDate") or ""
        try:
            deadline = datetime.strptime(raw_date, "%m/%d/%Y").date().isoformat()
        except ValueError:
            deadline = None
        categories = synopsis.get("fundingActivityCategories") or []
        funding_categories = [item.get("description", "") for item in categories if isinstance(item, dict)]
        try:
            amount = max(0, int(str(synopsis.get("awardCeiling") or "0").replace(",", "")))
        except ValueError:
            amount = 0
        records.append({
            "id": str(hit["id"]), "title": hit.get("title") or detail.get("opportunityTitle") or "Untitled opportunity",
            "funder": (detail.get("agencyDetails") or {}).get("agencyName") or hit.get("agencyCode") or "",
            "source_url": f"https://www.grants.gov/search-results-detail/{hit['id']}",
            "deadline": deadline, "focus": "", "amount": amount,
            "regions": "", "applicant_types": [item.get("description", "") for item in synopsis.get("applicantTypes") or [] if isinstance(item, dict)],
            "funding_categories": funding_categories,
        })
    return records
