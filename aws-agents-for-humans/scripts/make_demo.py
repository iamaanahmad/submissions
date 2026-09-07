"""Create explicitly synthetic project inputs for repeatable demonstrations."""

import argparse
import hashlib
import json
from pathlib import Path


def create_demo(destination: Path, clean: bool = False) -> None:
    destination.mkdir(parents=True, exist_ok=False)
    requirements = []
    items = [
        ("LANDING", "Landing page acceptance record", "passed", "approved"),
        ("CHECKOUT", "No-charge checkout acceptance record", "failed", "approved"),
        ("POLICY", "Policy copy review record", "passed", "pending"),
        ("EXPORT", "Customer export acceptance record", "passed", "approved"),
        ("REPORT", "Weekly report acceptance record", "passed", "not_required"),
    ]
    for item_id, title, check, approval in items:
        content = f"SYNTHETIC DEMO EVIDENCE ONLY\n{item_id}: {title}\n".encode()
        filename = f"{item_id.lower()}.txt"
        digest = hashlib.sha256(content).hexdigest()
        if item_id != "EXPORT" or clean:
            artifact = content + (
                b"Changed after review.\n" if item_id == "REPORT" and not clean else b""
            )
            (destination / filename).write_bytes(artifact)
        requirements.append(
            {
                "id": item_id,
                "title": title,
                "artifact": filename,
                "sha256": digest,
                "check": "passed" if clean else check,
                "approval": "approved" if clean else approval,
            }
        )
    (destination / "project.json").write_text(
        json.dumps(
            {
                "name": "Acorn studio handoff (synthetic demo)",
                "data_classification": "synthetic",
                "requirements": requirements,
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("destination", type=Path)
    parser.add_argument("--clean", action="store_true")
    args = parser.parse_args()
    create_demo(args.destination, args.clean)
