"""Run matched local comparisons with the pinned official organizer kit.

The engine holds scenario data. Only the standard snapshot protocol reaches
our strategy. Does not register, upload, contact organizers, or use API keys.
"""
import argparse
import hashlib
import json
import shutil
import subprocess
import sys
import tempfile
import urllib.request
import zipfile
from pathlib import Path

URL = "https://create.gosim.org/survey26/platform/downloads/agent-observer-starter-kit.zip"
SHA256 = "db871ba723d8ba7aa3b91fc38bb81d6172f3e827f3e9b830cba18f6ba23430c2"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=Path("benchmark-results.json"))
    parser.add_argument("--kit-zip", type=Path, help="Use a previously downloaded official kit; its hash must match")
    args = parser.parse_args()
    with tempfile.TemporaryDirectory(prefix="sky-window-") as temp:
        root = Path(temp)
        archive = root / "kit.zip"
        if args.kit_zip:
            shutil.copyfile(args.kit_zip, archive)
        else:
            with urllib.request.urlopen(URL, timeout=60) as response:
                with archive.open("wb") as output:
                    shutil.copyfileobj(response, output)
        if hashlib.sha256(archive.read_bytes()).hexdigest() != SHA256:
            raise SystemExit("Official kit changed. Recheck its rules and protocol before updating the pinned hash.")
        with zipfile.ZipFile(archive) as package:
            for member in package.infolist():
                path = Path(member.filename)
                if path.is_absolute() or ".." in path.parts or (member.external_attr >> 16) & 0o170000 == 0o120000:
                    raise SystemExit("Unsafe archive member")
            package.extractall(root)
        kit = root / "agent-observer-starter-kit"
        agent = root / "sky-window-agent"
        shutil.copytree(kit / "agent", agent)
        shutil.copyfile(Path(__file__).with_name("my_strategy.py"), agent / "my_strategy.py")
        heldout = root / "heldout-29"
        subprocess.run([sys.executable, str(kit / "make_scenario.py"), "--out", str(heldout),
                        "--seed", "29", "--days", "90", "--base", str(kit / "scenarios/finals-preview")],
                       check=True, capture_output=True, text=True)
        rows = []
        for name, scenario in [("dev-reference", kit / "scenarios/dev-reference"),
                               ("finals-preview", kit / "scenarios/finals-preview"), ("heldout-29", heldout)]:
            scores = {}
            for label, entry in [("baseline", kit / "agent/minimal_agent.py"), ("sky-window", agent / "minimal_agent.py")]:
                output = root / (name + "-" + label)
                result = subprocess.run([sys.executable, str(kit / "local_runner.py"), "--scenario", str(scenario),
                                         "--agent", str(entry), "--wallclock", "600", "--out", str(output), "--quiet"],
                                        check=True, capture_output=True, text=True)
                summary = json.loads(result.stdout)
                log = (output / "agent.log").read_text()
                if summary["termination_reason"] != "survey_complete" or "using the default ranking" in log:
                    raise SystemExit(f"{name}/{label}: incomplete run or strategy fallback")
                report = json.loads((output / "score_report.json").read_text())
                scores[label] = {k: v for k, v in summary.items() if k != "outputs"}
                scores[label]["full_score"] = report["score"]
                print(name, label, summary["total"], flush=True)
            rows.append({"scenario": name, "results": scores,
                         "delta": scores["sky-window"]["total"] - scores["baseline"]["total"]})
        args.output.write_text(json.dumps({"kit_sha256": SHA256, "comparisons": rows}, indent=2) + "\n")


if __name__ == "__main__":
    main()
