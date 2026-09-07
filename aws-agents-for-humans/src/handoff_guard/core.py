"""Validate declared delivery evidence without executing project code."""

import hashlib
import json
import re
import shutil
from datetime import UTC, datetime
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

MAX_MANIFEST_BYTES = 100_000
MAX_ARTIFACT_BYTES = 10_000_000


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class Requirement(StrictModel):
    id: str = Field(pattern=r"^[A-Z][A-Z0-9_-]{0,31}$")
    title: str = Field(min_length=1, max_length=160)
    artifact: str = Field(min_length=1, max_length=240)
    sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    check: Literal["passed", "failed", "not_run"]
    approval: Literal["approved", "pending", "rejected", "not_required"]

    @field_validator("title", "artifact")
    @classmethod
    def reject_controls(cls, value: str) -> str:
        if any(ord(char) < 32 for char in value):
            raise ValueError("Control characters are not allowed")
        return value


class Project(StrictModel):
    name: str = Field(min_length=1, max_length=120)
    data_classification: Literal["synthetic", "approved_local"]
    requirements: list[Requirement] = Field(min_length=1, max_length=100)

    @field_validator("name")
    @classmethod
    def reject_controls(cls, value: str) -> str:
        if any(ord(char) < 32 for char in value):
            raise ValueError("Control characters are not allowed")
        return value

    @model_validator(mode="after")
    def unique_ids(self) -> "Project":
        ids = [requirement.id for requirement in self.requirements]
        if len(ids) != len(set(ids)):
            raise ValueError("Requirement IDs must be unique")
        return self


def safe_artifact(root: Path, relative: str) -> Path:
    candidate = Path(relative)
    if candidate.is_absolute() or ".." in candidate.parts:
        raise ValueError("Evidence must use a relative path without parent traversal")
    current = root
    for part in candidate.parts:
        current = current / part
        if current.is_symlink():
            raise ValueError("Symbolic links are not allowed in evidence paths")
    resolved = current.resolve()
    if not resolved.is_relative_to(root):
        raise ValueError("Evidence must stay inside the project directory")
    return resolved


def digest_artifact(path: Path) -> str:
    if not path.is_file():
        raise ValueError("Artifact is missing or is not a regular file")
    if path.stat().st_size > MAX_ARTIFACT_BYTES:
        raise ValueError("Artifact exceeds the 10 MB limit")
    return hashlib.sha256(path.read_bytes()).hexdigest()


def read_project(root: Path) -> Project:
    manifest = safe_artifact(root, "project.json")
    if not manifest.is_file() or manifest.stat().st_size > MAX_MANIFEST_BYTES:
        raise ValueError("project.json is missing or exceeds the 100 KB limit")
    return Project.model_validate_json(manifest.read_bytes())


def audit_project(root: Path) -> dict:
    root = root.resolve(strict=True)
    project = read_project(root)
    findings = []
    for requirement in project.requirements:
        blockers = []
        actual_hash = None
        try:
            actual_hash = digest_artifact(safe_artifact(root, requirement.artifact))
            if actual_hash != requirement.sha256:
                blockers.append("artifact_changed")
        except ValueError as error:
            blockers.append(str(error))
        if requirement.check != "passed":
            blockers.append(f"check_{requirement.check}")
        if requirement.approval not in {"approved", "not_required"}:
            blockers.append(f"approval_{requirement.approval}")
        findings.append(
            {
                **requirement.model_dump(),
                "actual_sha256": actual_hash,
                "status": "blocked" if blockers else "verified",
                "blockers": blockers,
            }
        )
    blocked = sum(finding["status"] == "blocked" for finding in findings)
    manifest_hash = hashlib.sha256((root / "project.json").read_bytes()).hexdigest()
    return {
        "project": project.name,
        "classification": project.data_classification,
        "status": "hold" if blocked else "ready_for_human_review",
        "verified": len(findings) - blocked,
        "blocked": blocked,
        "manifest_sha256": manifest_hash,
        "findings": findings,
    }


def plain(value: str) -> str:
    return re.sub(r"[\\`*_{}\[\]<>#|]", "", value)


def report_markdown(audit: dict) -> str:
    lines = [
        f"# {plain(audit['project'])}",
        "",
        "## Handoff decision",
        "",
        "HOLD" if audit["blocked"] else "READY FOR HUMAN REVIEW",
        f"{audit['verified']} verified deliverables. {audit['blocked']} blocked deliverables.",
        "",
        "Evidence hashes were checked. Test and approval states come from the supplied manifest.",
        "This does not certify correctness, deployment, or customer acceptance.",
        "",
        "| ID | Deliverable | Result | Action |",
        "|---|---|---|---|",
    ]
    for finding in audit["findings"]:
        action = ", ".join(finding["blockers"]) or "Review the included evidence"
        lines.append(
            f"| {finding['id']} | {plain(finding['title'])} | "
            f"{finding['status']} | {plain(action)} |"
        )
    lines.extend(
        [
            "",
            "## Evidence boundary",
            "",
            "Only verified deliverables are copied into this packet.",
            "Missing, changed, failed, and unapproved items stay out.",
            "No files were executed. No messages were sent. No release was deployed.",
            "",
        ]
    )
    return "\n".join(lines)


def write_packet(root: Path, output: Path, expected: dict, advisory: str = "") -> dict:
    root = root.resolve(strict=True)
    output = output.absolute()
    if output.resolve().is_relative_to(root):
        raise ValueError("Output must be outside the input project")
    current = audit_project(root)
    if current != expected:
        raise ValueError("Evidence changed after audit; audit again before writing")
    output.mkdir(parents=True, exist_ok=False)
    try:
        evidence = output / "evidence"
        evidence.mkdir()
        for finding in current["findings"]:
            if finding["status"] != "verified":
                continue
            source = safe_artifact(root, finding["artifact"])
            copied = evidence / finding["id"]
            shutil.copyfile(source, copied)
            if digest_artifact(copied) != finding["sha256"]:
                raise ValueError("Evidence changed during packet creation")
        (output / "handoff.md").write_text(report_markdown(current), encoding="utf-8")
        (output / "audit.json").write_text(
            json.dumps({**current, "created_at": datetime.now(UTC).isoformat()}, indent=2) + "\n",
            encoding="utf-8",
        )
        message = (
            f"Draft only: {current['project']}\n\n"
            f"We checked {len(current['findings'])} declared deliverables. "
            f"{current['blocked']} need attention before handoff.\n"
            "Please review handoff.md and the evidence packet. Nothing has been sent or deployed.\n"
        )
        (output / "message-draft.txt").write_text(message, encoding="utf-8")
        if advisory:
            (output / "agent-advisory.txt").write_text(
                "MODEL ADVISORY ONLY. Checked hashes and declared states are in audit.json.\n\n"
                + advisory,
                encoding="utf-8",
            )
    except Exception:
        shutil.rmtree(output)
        raise
    return {"output": str(output), "status": current["status"], "blocked": current["blocked"]}
