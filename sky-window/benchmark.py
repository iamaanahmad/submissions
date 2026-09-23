"""Run matched local comparisons with the pinned official organizer kit.

The engine holds scenario data. Only the standard snapshot protocol reaches
our strategy. Does not register, upload, contact organizers, or use API keys.
"""
import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
import urllib.request
import zipfile
from pathlib import Path

from verification import require_complete, require_strategy_decisions

URL = "https://create.gosim.org/survey26/platform/downloads/agent-observer-starter-kit.zip"
SHA256 = "db871ba723d8ba7aa3b91fc38bb81d6172f3e827f3e9b830cba18f6ba23430c2"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=Path("benchmark-results.json"))
    parser.add_argument("--kit-zip", type=Path, help="Use a previously downloaded official kit; its hash must match")
    parser.add_argument("--seeds", type=int, nargs="+", default=[29],
                        help="Generated scenario seeds; choose unused seeds before evaluating a fixed strategy")
    parser.add_argument("--days", type=int, default=90, help="Nights per generated scenario (default: 90)")
    parser.add_argument("--generated-only", action="store_true", help="Skip the two already published scenarios")
    args = parser.parse_args()
    if args.days < 1 or args.days > 366:
        parser.error("--days must be between 1 and 366")
    if len(args.seeds) != len(set(args.seeds)):
        parser.error("--seeds must be unique")
    if args.output.exists():
        parser.error("output already exists; use a new path to preserve prior evidence")
    strategy_hash = hashlib.sha256(Path(__file__).with_name("my_strategy.py").read_bytes()).hexdigest()
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
        scenarios = [] if args.generated_only else [
            ("dev-reference", kit / "scenarios/dev-reference"),
            ("finals-preview", kit / "scenarios/finals-preview")]
        for seed in args.seeds:
            name = f"heldout-{seed}"
            generated = root / name
            subprocess.run([sys.executable, str(kit / "make_scenario.py"), "--out", str(generated),
                            "--seed", str(seed), "--days", str(args.days),
                            "--base", str(kit / "scenarios/finals-preview")],
                           check=True, capture_output=True, text=True)
            scenarios.append((name, generated))
        # Do not inherit model credentials or a provider selected in the caller shell.
        env = {"PATH": str(Path(sys.executable).parent), "PYTHONNOUSERSITE": "1",
               "MODEL_PROVIDER": "deterministic"}
        if os.name == "nt":
            env["SYSTEMROOT"] = os.environ["SYSTEMROOT"]
        rows = []
        for name, scenario in scenarios:
            scores = {}
            for label, entry in [("baseline", kit / "agent/minimal_agent.py"), ("sky-window", agent / "minimal_agent.py")]:
                output = root / (name + "-" + label)
                result = subprocess.run([sys.executable, str(kit / "local_runner.py"), "--scenario", str(scenario),
                                         "--agent", str(entry), "--python", sys.executable,
                                         "--wallclock", "600", "--out", str(output), "--quiet"],
                                        check=True, capture_output=True, text=True, env=env, timeout=660)
                summary = json.loads(result.stdout)
                log = (output / "agent.log").read_text()
                try:
                    require_complete(summary, log)
                    observations = (require_strategy_decisions(output / "decisions.csv")
                                    if label == "sky-window" else None)
                except ValueError as error:
                    raise SystemExit(f"{name}/{label}: {error}") from error
                report = json.loads((output / "score_report.json").read_text())
                scores[label] = {k: v for k, v in summary.items() if k != "outputs"}
                scores[label]["full_score"] = report["score"]
                if observations is not None:
                    scores[label]["verified_observations"] = observations
                print(name, label, summary["total"], flush=True)
            rows.append({"scenario": name, "results": scores,
                         "delta": scores["sky-window"]["total"] - scores["baseline"]["total"]})
        args.output.write_text(json.dumps({
            "kit_sha256": SHA256, "strategy_sha256": strategy_hash,
            "model_provider": "deterministic", "credential_environment_inherited": False,
            "generated_seeds": args.seeds, "generated_days": args.days,
            "comparisons": rows,
            "aggregate": {
                "baseline_total": sum(r["results"]["baseline"]["total"] for r in rows),
                "strategy_total": sum(r["results"]["sky-window"]["total"] for r in rows),
                "wins": sum(r["delta"] > 0 for r in rows),
                "losses": sum(r["delta"] < 0 for r in rows),
                "ties": sum(r["delta"] == 0 for r in rows),
            }}, indent=2) + "\n")


if __name__ == "__main__":
    main()
