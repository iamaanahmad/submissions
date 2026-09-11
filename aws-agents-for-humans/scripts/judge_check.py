"""Exercise the installed CLI with synthetic evidence; no model or credentials needed."""

import hashlib
import json
import subprocess
import sys
from pathlib import Path
from tempfile import TemporaryDirectory

from make_demo import create_demo


def require(condition: bool, message: str) -> None:
    if not condition:
        raise RuntimeError(message)


def snapshot(root: Path) -> dict[str, str]:
    return {
        str(path.relative_to(root)): hashlib.sha256(path.read_bytes()).hexdigest()
        for path in sorted(root.rglob("*"))
        if path.is_file()
    }


def invoke(*args: str, success: bool = True) -> subprocess.CompletedProcess:
    result = subprocess.run(
        [sys.executable, "-m", "handoff_guard.cli", *args],
        capture_output=True,
        text=True,
        timeout=30,
        check=False,
    )
    require(
        (result.returncode == 0) == success,
        f"Unexpected CLI exit {result.returncode}: {result.stderr}",
    )
    if not success:
        require("Handoff stopped:" in result.stderr, "Missing controlled failure message")
    return result


def check_packet(output: Path, expected_ids: set[str], blocked: int) -> None:
    audit = json.loads((output / "audit.json").read_text())
    require(audit["blocked"] == blocked, "Wrong blocked count in saved packet")
    require(
        {path.name for path in (output / "evidence").iterdir()} == expected_ids,
        "Packet copied the wrong evidence",
    )
    for finding in audit["findings"]:
        if finding["id"] in expected_ids:
            actual = hashlib.sha256((output / "evidence" / finding["id"]).read_bytes())
            require(actual.hexdigest() == finding["sha256"], "Copied evidence hash mismatch")
    report = (output / "handoff.md").read_text()
    require("HOLD" in report if blocked else "READY FOR HUMAN REVIEW" in report, "Wrong report")
    require("supplied manifest" in report, "Missing evidence boundary")


def main() -> None:
    with TemporaryDirectory(prefix="handoff-judge-") as temporary:
        root = Path(temporary)
        incomplete, corrected = root / "incomplete", root / "corrected"
        create_demo(incomplete)
        create_demo(corrected, clean=True)
        before = {str(path): snapshot(path) for path in (incomplete, corrected)}

        audit = json.loads(invoke("audit", str(incomplete)).stdout)
        require((audit["verified"], audit["blocked"]) == (1, 4), "Wrong incomplete audit")
        blockers = {row["id"]: row["blockers"] for row in audit["findings"]}
        require("check_failed" in blockers["CHECKOUT"], "Failed check was not held")
        require("approval_pending" in blockers["POLICY"], "Pending approval was not held")
        require("artifact_changed" in blockers["REPORT"], "Changed evidence was not held")
        require(bool(blockers["EXPORT"]), "Missing evidence was not held")
        held_packet = root / "held-packet"
        invoke("packet", str(incomplete), "--output", str(held_packet))
        check_packet(held_packet, {"LANDING"}, 4)

        ready_packet = root / "ready-packet"
        invoke("packet", str(corrected), "--output", str(ready_packet))
        check_packet(ready_packet, {"LANDING", "CHECKOUT", "POLICY", "EXPORT", "REPORT"}, 0)
        saved_packet = snapshot(ready_packet)
        invoke("packet", str(corrected), "--output", str(ready_packet), success=False)
        require(snapshot(ready_packet) == saved_packet, "Existing packet was changed")

        nested = corrected / "nested-output"
        invoke("packet", str(corrected), "--output", str(nested), success=False)
        require(not nested.exists(), "Invalid nested output was created")
        for path in (incomplete, corrected):
            require(snapshot(path) == before[str(path)], "Input evidence was changed")

        malformed = root / "malformed"
        malformed.mkdir()
        (malformed / "project.json").write_text("{broken json", encoding="utf-8")
        invoke("packet", str(malformed), "--output", str(root / "invalid"), success=False)
        require(not (root / "invalid").exists(), "Malformed input created a packet")

        # A controlled failure must not prevent a subsequent valid run.
        recovered = root / "recovered"
        invoke("packet", str(corrected), "--output", str(recovered))
        check_packet(recovered, {"LANDING", "CHECKOUT", "POLICY", "EXPORT", "REPORT"}, 0)

    require(not root.exists(), "Temporary demonstration evidence was not cleaned up")
    print(
        json.dumps(
            {
                "status": "passed",
                "mode": "deterministic CLI; not a Strands model run",
                "incomplete": {"copied": 1, "held": 4},
                "corrected": {"copied": 5, "held": 0},
                "checks": [
                    "failed, pending, missing, and changed evidence held",
                    "only verified evidence copied with matching hashes",
                    "existing packet preserved on retry",
                    "nested output rejected without changing inputs",
                    "malformed input rejected without output",
                    "valid run succeeds after controlled failure",
                    "temporary synthetic evidence removed",
                ],
                "limits": "Declared tests and approvals are not independently verified.",
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
