# Verification

## Reproduce the checks

```sh
uv sync --frozen --group dev
uv run ruff check .
uv run ruff format --check .
uv run pytest -q
uv run python scripts/verify_agent.py /tmp/guard-verification
```

The last command needs the local model server described in the README.
It runs the blocked and clean scenarios through actual Strands tool calls.
It checks the verdict, verified file count, copied evidence count, and tool sequence.
It saves raw agent traces and elapsed times under the selected new directory.
This live-model check is not part of model-free CI.

## Environment

Python 3.13.5 on Linux x86-64, CPU inference only.
Strands Agents SDK 1.54.0. Dependency versions and hashes are in `uv.lock`.
llama.cpp release b10840, reported version 0.4.0-dev, commit 73ab7599b.
Official model: `Qwen/Qwen3-1.7B-GGUF`, file `Qwen3-1.7B-Q8_0.gguf`.
Model repository revision: `90862c4b9d2787eaed51d12237eafdfe7c5f6077`.
Server configuration: one inference thread, one batch thread, one slot, 8192-token context, thinking disabled.

## Test scope

The model-free suite covers malformed manifests, missing and changed files, declared failures, and unresolved approvals.
It also covers duplicate IDs, path escapes, symbolic links, size limits, changed evidence after inspection, and output collisions.
Endpoint tests reject remote inference addresses. A call-budget test bounds the agent loop.
Both synthetic fixtures have five declared items. These are not customer projects or real deployment checks.

## Results

On September 7, the model-free suite passed 31 tests. Lint and formatting checks passed.
Both real local-model runs completed on September 7. Neither used paid services.

| Synthetic scenario | Checked items | Blocked | Copied evidence files | Verdict |
|---|---|---|---|---|
| Missing, changed, failed, and unapproved evidence | 5 | 4 | 1 | Hold |
| All declared checks and approvals pass | 5 | 0 | 5 | Ready for human review |

The clean run took 271.72 seconds. The blocked command took 319.69 seconds, including Python startup.
The blocked agent inspected, created the packet, then inspected again.
The first verifier rejected that harmless extra inspection after the packet was complete.
The verifier now checks inspection comes first and exactly one packet is created, allowing repeat inspections.
Both saved outputs passed that corrected check, including independent copied-file hash comparisons.
The clean case ran separately after this correction. The two-case script was not rerun as one command.

Real outputs, audit records, and complete synthetic model traces are in `examples/`.
The Markdown examples were rendered again from those audits after improving blocker labels.
Model advice remains non-binding and can miss detail. Use the code-generated audit and handoff decision.

## Limits

No production customer data, paid inference, AWS deployment, email, or submission was tested.
No performance, revenue, or competition placement claim follows from these fixtures.
