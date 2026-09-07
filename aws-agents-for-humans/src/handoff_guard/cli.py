"""Command-line entry point. No server, shell, or outbound messaging tools."""

import argparse
import json
import sys
from pathlib import Path

from handoff_guard.core import audit_project, write_packet


def main() -> None:
    parser = argparse.ArgumentParser(description="Build an evidence-checked project handoff")
    parser.add_argument("mode", choices=["audit", "packet", "agent"])
    parser.add_argument("project", type=Path)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--endpoint", default="http://127.0.0.1:8087/v1")
    parser.add_argument("--model", default="handoff-local")
    args = parser.parse_args()
    if args.mode != "audit" and args.output is None:
        parser.error("--output is required for packet and agent modes")
    try:
        if args.mode == "agent":
            from handoff_guard.agent import run_agent

            result = run_agent(args.project, args.output, args.endpoint, args.model)
        else:
            result = audit_project(args.project)
            if args.mode == "packet":
                result = write_packet(args.project, args.output, result)
        print(json.dumps(result, indent=2))
    except (ValueError, OSError, RuntimeError) as error:
        print(f"Handoff stopped: {error}", file=sys.stderr)
        raise SystemExit(1) from error


if __name__ == "__main__":
    main()
