# Handoff Guard

A local Strands agent that checks delivery evidence before a project handoff.

Small studios often hand over work with missing files, stale evidence, or unresolved approval.
Handoff Guard checks those gaps and creates a review packet. It never sends that packet or deploys a release.

## What it does

The agent calls two tools: `inspect_delivery`, then `create_handoff`.
The first tool compares files with the manifest's SHA-256 hashes and declared test and approval states.
The second tool checks the evidence again and copies only verified items into a new packet.

The language model suggests next actions. Python code owns the handoff decision.
A model cannot turn a blocked item into an accepted item.
"Ready for human review" does not mean released, customer-approved, or independently tested.

## Run without a model

Install Python 3.11 or later and [uv](https://docs.astral.sh/uv/).
From this directory:

```sh
uv sync --frozen --group dev
uv run python scripts/make_demo.py /tmp/guard-demo
uv run handoff-guard audit /tmp/guard-demo
uv run handoff-guard packet /tmp/guard-demo --output /tmp/guard-packet
cat /tmp/guard-packet/handoff.md
```

Use new input and output directories for each run. Existing output is never overwritten.
This fixture contains five synthetic items. One passes; four are held for different reasons.
Add `--clean` to `make_demo.py` to create five passing synthetic items.
These modes test the deterministic engine; they are not language-model runs.

## Run the real Strands agent locally

No cloud credentials or paid inference are needed.
Use a trusted [llama.cpp server](https://github.com/ggml-org/llama.cpp/tree/master/tools/server)
and the official [Qwen3 1.7B GGUF model](https://huggingface.co/Qwen/Qwen3-1.7B-GGUF).
Download tools and model weights separately; they are not bundled in this repository.
The tested server and model revisions are recorded in `docs/verification.md`.

```sh
llama-server -m /path/to/Qwen3-1.7B-Q8_0.gguf --alias handoff-local \
  --host 127.0.0.1 --port 8087 -c 8192 -t 1 -tb 1 -np 1 --jinja \
  --cors-origins http://127.0.0.1:8087 \
  --chat-template-kwargs '{"enable_thinking":false}'
```

In another terminal:

```sh
uv run handoff-guard agent /tmp/guard-demo --output /tmp/guard-agent-packet
cat /tmp/guard-agent-packet/handoff.md
cat /tmp/guard-agent-packet/agent-advisory.txt
```

The endpoint defaults to `http://127.0.0.1:8087/v1`.
Only explicit HTTP loopback addresses are accepted. Do not expose the model server publicly.
Model calls have a 120-second request timeout, no client retries, and a six-call budget.
Model behavior varies. A missing tool completion fails the command, rather than reporting success.
If a run stops after writing a packet, inspect the partial output and use a new directory when retrying.

## Input contract

Each project has one `project.json` and its local evidence files:

```json
{
  "name": "Example project",
  "data_classification": "synthetic",
  "requirements": [{
    "id": "REPORT",
    "title": "Reviewed delivery report",
    "artifact": "report.txt",
    "sha256": "replace with the file's 64-character lowercase SHA-256 hash",
    "check": "passed",
    "approval": "approved"
  }]
}
```

Use `sha256sum report.txt` to get the actual hash. The placeholder above is not a valid hash.
Classification must be `synthetic` or `approved_local`; this label is not a consent mechanism.
Checks are `passed`, `failed`, or `not_run`.
Approvals are `approved`, `pending`, `rejected`, or `not_required`.
IDs must be unique uppercase identifiers. Unknown fields and control characters are rejected.

## Output

| File | Purpose |
|---|---|
| `handoff.md` | Fixed decision, blockers, and evidence boundary |
| `audit.json` | Checked hashes, declared states, and creation time |
| `evidence/` | Verified files copied under their requirement IDs |
| `message-draft.txt` | Unsent handoff note |
| `agent-advisory.txt` | Non-binding model suggestions, agent mode only |
| `agent-trace.json` | Actual Strands messages and completed tool sequence |

## Safety and limits

This prototype assumes a trusted local directory with no concurrent writer.
It is not a sandbox for hostile users or a substitute for build attestations.
The caller supplies the expected hashes, tests, and approvals. Their truth is not independently verified.
No shell, browser, deployment, email, or payment tools are available to the agent.
File contents are hashed and copied; only manifest metadata and findings reach the local model.
The local model server must be trusted. A loopback address cannot guarantee that server's behavior.
Treat its advisory and trace as untrusted text, not executable instructions.
Do not publish packets containing client material without permission.

Paths cannot escape the input directory. Symlink evidence is rejected.
Manifests are limited to 100 KB, with 100 items and 10 MB per artifact.
Output must be outside the input directory. Source files remain unchanged.

## Checks and entry status

```sh
uv run ruff check .
uv run ruff format --check .
uv run pytest -q
```

CI runs these checks without model weights or cloud services.
See [architecture](docs/architecture.md), [demo script](docs/demo-script.md),
[verification](docs/verification.md), and [entry checklist](docs/entry-checklist.md).
This is a prototype for review, not a submitted hackathon entry.
