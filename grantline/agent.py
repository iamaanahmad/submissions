"""Evidence-first grant review agent. Uses only records provided by the operator."""

from __future__ import annotations

import hashlib
import json
from datetime import date, datetime, timezone
from typing import Any


def _tokens(value: str) -> set[str]:
    return {part.strip().lower() for part in value.replace(";", ",").split(",") if part.strip()}


def _applicant_types(value: Any) -> list[str]:
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    return [part.strip() for part in str(value or "").replace(";", ",").split(",") if part.strip()]


def _number(value: Any) -> int:
    try:
        return max(0, int(value))
    except (TypeError, ValueError):
        return 0


def _identity(row: dict[str, Any]) -> str:
    primary = str(row.get("id") or "").strip()
    if primary:
        return primary
    raw = "|".join(str(row.get(key, "")).strip().lower() for key in ("title", "funder", "source_url"))
    return hashlib.sha256(raw.encode()).hexdigest()[:16]


def _parse_deadline(value: Any) -> date | None:
    try:
        return date.fromisoformat(str(value))
    except (TypeError, ValueError):
        return None


def analyze(organization: dict[str, Any], rows: list[dict[str, Any]], today: date | None = None) -> dict[str, Any]:
    """Return ranked leads, exclusions, and an auditable decision trace."""
    today = today or datetime.now(timezone.utc).date()
    name = str(organization.get("name", "")).strip()
    region = str(organization.get("region", "")).strip().lower()
    focus = _tokens(str(organization.get("focus", "")))
    need = _number(organization.get("funding_need"))
    if not name or not region or not focus or not need:
        raise ValueError("Organization needs name, region, focus, and a positive funding need.")
    if not isinstance(rows, list) or len(rows) > 500:
        raise ValueError("Provide at most 500 grant records.")

    seen: set[str] = set()
    results: list[dict[str, Any]] = []
    trace: list[dict[str, Any]] = []
    for index, row in enumerate(rows):
        if not isinstance(row, dict):
            raise ValueError(f"Grant record {index + 1} must be an object.")
        identifier = _identity(row)
        title = str(row.get("title", "")).strip()
        source = str(row.get("source_url", "")).strip()
        deadline = _parse_deadline(row.get("deadline"))
        amount = _number(row.get("amount"))
        regions = _tokens(str(row.get("regions", "")))
        focuses = _tokens(str(row.get("focus", "")))
        applicant_types = _applicant_types(row.get("applicant_types"))
        reviewed_fields = set(row.get("reviewed_fields", [])) if isinstance(row.get("reviewed_fields"), list) else set()
        evidence = [
            {"field": key, "value": row.get(key), "source_url": source,
             "provenance": "operator source note" if key in reviewed_fields and row.get("source_note") else "imported record"}
            for key in ("deadline", "regions", "focus", "amount", "applicant_types", "funding_categories")
            if key in row or key in ("deadline", "regions", "focus", "amount")
        ]
        reasons: list[str] = []
        if identifier in seen:
            reasons.append("Duplicate source record")
        seen.add(identifier)
        if not title or not source.startswith(("https://", "http://")):
            reasons.append("Missing title or source URL")
        if not deadline:
            reasons.append("Invalid or missing deadline")
        elif deadline < today:
            reasons.append("Deadline has passed")
        if not regions:
            reasons.append("Region eligibility needs source review")
        elif region not in regions and "any" not in regions:
            reasons.append("Region is outside stated eligibility")
        overlap = sorted(focus & focuses)
        if not focuses:
            reasons.append("Program focus needs source review")
        elif not overlap:
            reasons.append("No matching program focus")
        if amount <= 0:
            reasons.append("Funding amount is missing")
        nonprofit_allowed = any("nonprofit" in item.lower() or "non-profit" in item.lower() for item in applicant_types)
        if not applicant_types:
            reasons.append("Nonprofit applicant eligibility needs source review")
        elif not nonprofit_allowed:
            reasons.append("Listed applicant types exclude nonprofits")
        review_reasons = {"Region eligibility needs source review", "Program focus needs source review", "Funding amount is missing", "Nonprofit applicant eligibility needs source review"}
        status = "candidate" if not reasons else ("needs_review" if set(reasons) <= review_reasons else "excluded")
        score = 0
        if status == "candidate":
            days = (deadline - today).days  # type: ignore[operator]
            score = 40 + min(30, len(overlap) * 15) + min(20, int(20 * min(amount, need) / need)) + (10 if days >= 21 else 5)
            reasons = [f"Matches {', '.join(overlap)}", f"Region includes {region}", f"${amount:,} listed", f"{days} days until deadline"]
        result = {
            "id": identifier, "title": title or "Untitled record", "funder": str(row.get("funder", "")).strip(),
            "source_url": source, "deadline": deadline.isoformat() if deadline else None,
            "amount": amount, "status": status, "score": score, "reasons": reasons,
            "evidence": evidence, "next_action": "Verify the source and prepare an application" if status == "candidate" else ("Read the original notice and fill missing eligibility fields" if status == "needs_review" else "Review source data"),
        }
        results.append(result)
        trace.append({"step": index + 1, "record_id": identifier, "decision": status, "rules": reasons,
                      "source_url": source, "source_note": str(row.get("source_note", "")).strip(),
                      "reviewed_fields": sorted(reviewed_fields)})
    order = {"candidate": 0, "needs_review": 1, "excluded": 2}
    results.sort(key=lambda item: (order[item["status"]], -item["score"], item["deadline"] or "9999"))
    candidates = sum(item["status"] == "candidate" for item in results)
    needs_review = sum(item["status"] == "needs_review" for item in results)
    return {
        "organization": name, "evaluated_on": today.isoformat(), "candidates": candidates,
        "needs_review": needs_review, "excluded": len(results) - candidates - needs_review, "results": results, "trace": trace,
        "caution": "Matches are leads, not verified eligibility. Read each original source before applying.",
    }


def to_jsonl(report: dict[str, Any]) -> str:
    return "\n".join(json.dumps(item, sort_keys=True) for item in report["trace"]) + "\n"
