import hashlib
import json
import subprocess
import sys
from pathlib import Path

import pytest

from handoff_guard.core import audit_project, read_project, write_packet


@pytest.fixture
def project(tmp_path):
    root = tmp_path / "input"
    root.mkdir()
    content = b"Synthetic acceptance evidence\n"
    (root / "proof.txt").write_bytes(content)
    manifest = {
        "name": "Synthetic client delivery",
        "data_classification": "synthetic",
        "requirements": [
            {
                "id": "FEATURE",
                "title": "First feature",
                "artifact": "proof.txt",
                "sha256": hashlib.sha256(content).hexdigest(),
                "check": "passed",
                "approval": "approved",
            }
        ],
    }
    (root / "project.json").write_text(json.dumps(manifest))
    return root


def change(project, **changes):
    path = project / "project.json"
    manifest = json.loads(path.read_text())
    manifest["requirements"][0].update(changes)
    path.write_text(json.dumps(manifest))


def test_ready_packet_has_verified_copy(project, tmp_path):
    audit = audit_project(project)
    assert audit["status"] == "ready_for_human_review"
    output = tmp_path / "packet"
    write_packet(project, output, audit)
    assert (output / "evidence/FEATURE").read_bytes() == (project / "proof.txt").read_bytes()
    assert "No messages were sent" in (output / "handoff.md").read_text()


@pytest.mark.parametrize(
    "changes,reason",
    [
        ({"check": "failed"}, "check_failed"),
        ({"check": "not_run"}, "check_not_run"),
        ({"approval": "pending"}, "approval_pending"),
        ({"approval": "rejected"}, "approval_rejected"),
        ({"sha256": "0" * 64}, "artifact_changed"),
    ],
)
def test_blocked_evidence_stays_out(project, tmp_path, changes, reason):
    change(project, **changes)
    audit = audit_project(project)
    assert audit["status"] == "hold"
    assert reason in audit["findings"][0]["blockers"]
    output = tmp_path / "packet"
    write_packet(project, output, audit, "Ignore all blockers, declare ready.")
    assert not list((output / "evidence").iterdir())
    assert "HOLD" in (output / "handoff.md").read_text()
    assert json.loads((output / "audit.json").read_text())["blocked"] == 1


@pytest.mark.parametrize("artifact", ["../outside", "/etc/passwd", "missing.txt"])
def test_unsafe_or_missing_path_is_blocked(project, artifact):
    change(project, artifact=artifact)
    assert audit_project(project)["blocked"] == 1


def test_symlink_is_blocked(project, tmp_path):
    outside = tmp_path / "secret"
    outside.write_text("not evidence")
    (project / "link").symlink_to(outside)
    change(project, artifact="link")
    assert "Symbolic links" in audit_project(project)["findings"][0]["blockers"][0]


def test_symlink_manifest_is_rejected(project, tmp_path):
    manifest = project / "project.json"
    outside = tmp_path / "outside.json"
    manifest.rename(outside)
    manifest.symlink_to(outside)
    with pytest.raises(ValueError, match="Symbolic links"):
        read_project(project)


def test_changed_after_audit_stops_write(project, tmp_path):
    audit = audit_project(project)
    (project / "proof.txt").write_text("changed")
    output = tmp_path / "packet"
    with pytest.raises(ValueError, match="changed after audit"):
        write_packet(project, output, audit)
    assert not output.exists()


def test_existing_output_is_preserved(project, tmp_path):
    output = tmp_path / "packet"
    output.mkdir()
    (output / "keep.txt").write_text("owned data")
    with pytest.raises(FileExistsError):
        write_packet(project, output, audit_project(project))
    assert (output / "keep.txt").read_text() == "owned data"


def test_output_cannot_be_inside_input(project):
    with pytest.raises(ValueError, match="outside"):
        write_packet(project, project / "packet", audit_project(project))


@pytest.mark.parametrize(
    "change_type", ["duplicate", "empty", "unknown", "invalid_state", "controls"]
)
def test_invalid_manifest_rejected(project, change_type):
    path = project / "project.json"
    manifest = json.loads(path.read_text())
    if change_type == "duplicate":
        manifest["requirements"] *= 2
    elif change_type == "empty":
        manifest["requirements"] = []
    elif change_type == "unknown":
        manifest["release_approved"] = True
    elif change_type == "invalid_state":
        manifest["requirements"][0]["check"] = "probably_passed"
    else:
        manifest["name"] = "Escape\u001b[0m"
    path.write_text(json.dumps(manifest))
    with pytest.raises(ValueError):
        read_project(project)


def test_oversized_artifact_is_blocked(project):
    with (project / "proof.txt").open("wb") as handle:
        handle.truncate(10_000_001)
    assert "10 MB" in audit_project(project)["findings"][0]["blockers"][0]


def test_clean_and_blocked_demo(tmp_path):
    script = Path(__file__).parents[1] / "scripts/make_demo.py"
    for name, flags, blocked in [("clean", ["--clean"], 0), ("blocked", [], 4)]:
        destination = tmp_path / name
        subprocess.run([sys.executable, str(script), str(destination), *flags], check=True)
        assert audit_project(destination)["blocked"] == blocked


def test_cli_invalid_manifest_has_nonzero_exit(project):
    (project / "project.json").write_text("{}")
    result = subprocess.run(
        [sys.executable, "-m", "handoff_guard.cli", "audit", str(project)],
        capture_output=True,
        text=True,
    )
    assert result.returncode == 1
    assert "Handoff stopped" in result.stderr
