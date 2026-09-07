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
Live-model verification results will be recorded before this pull request is marked ready.

## Limits

No production customer data, paid inference, AWS deployment, email, or submission was tested.
No performance, revenue, or competition placement claim follows from these fixtures.
