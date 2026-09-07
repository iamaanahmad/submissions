"""Run both synthetic scenarios through a real local Strands model."""

import argparse
import json
import time
from pathlib import Path

from make_demo import create_demo

from handoff_guard.agent import run_agent


def verify(destination: Path, endpoint: str, model: str) -> None:
    destination.mkdir(parents=True, exist_ok=False)
    measurements = []
    for scenario, clean, expected_blocked in [("blocked", False, 4), ("clean", True, 0)]:
        source = destination / f"{scenario}-input"
        output = destination / f"{scenario}-packet"
        create_demo(source, clean)
        started = time.monotonic()
        result = run_agent(source, output, endpoint, model)
        elapsed = round(time.monotonic() - started, 2)
        audit = json.loads((output / "audit.json").read_text())
        trace = json.loads((output / "agent-trace.json").read_text())
        assert result["blocked"] == expected_blocked
        assert audit["verified"] == 5 - expected_blocked
        calls = trace["tool_calls"]
        assert calls[0] == "inspect_delivery"
        assert calls.count("create_handoff") == 1
        assert set(calls) == {"inspect_delivery", "create_handoff"}
        assert len(list((output / "evidence").iterdir())) == audit["verified"]
        measurements.append(
            {
                "scenario": scenario,
                "elapsed_seconds": elapsed,
                "result": result,
                "tool_calls": trace["tool_calls"],
            }
        )
        print(json.dumps(measurements[-1]), flush=True)
    (destination / "measurements.json").write_text(json.dumps(measurements, indent=2) + "\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("destination", type=Path)
    parser.add_argument("--endpoint", default="http://127.0.0.1:8087/v1")
    parser.add_argument("--model", default="handoff-local")
    args = parser.parse_args()
    verify(args.destination, args.endpoint, args.model)
