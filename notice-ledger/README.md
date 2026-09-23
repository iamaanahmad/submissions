# Notice Ledger

A small command-line prototype for watching search evidence from an official publisher.
Built for evaluation against the SerpApi India Hackathon 2026. **Not submitted.**

A grant researcher can save a publisher-scoped search, then compare the next observation.
The ledger distinguishes newly returned links, changed indexed excerpts, and links not returned this time.
It does not claim a notice was removed, a grant is open, or a deadline changed.

## Run locally

Python 3.11 or later. No dependencies.

```sh
python3 -m unittest discover -s notice-ledger -v
# Supply your own free SerpApi key privately in SERPAPI_API_KEY.
python3 notice-ledger/ledger.py --domain dst.gov.in --query 'call for proposals' --baseline /tmp/notices.json
```

Each live invocation makes at most one SerpApi request with no automatic retries.
SerpApi's default cache applies. Repeated queries can reuse cached results; they do not prove a fresh web change.
Only the first organic result page is observed. Search ranking is incomplete and can vary.
Use separate baseline files for different searches and for offline fixtures.
The baseline contains the latest and immediately preceding observations, search IDs and the comparison.
Copy it elsewhere for longer archival retention.

## Reproducible demo

```sh
python3 notice-ledger/demo.py
```

This runs the real CLI in five checked scenarios: first observation, changed evidence,
provider failure, lookalike publisher, and changed search scope. Responses are explicitly
synthetic; the demo makes no network calls and spends no search credits. Temporary
fixtures and baselines are removed when it finishes. A failed check exits nonzero.
Use `--pause 7` to pace a local screen recording.

[Watch the local walkthrough](https://github.com/iamaanahmad/submissions/releases/download/notice-ledger-demo-20260923/notice-ledger-demo-20260923.mp4).
The video shows actual CLI output through a local text viewer. It demonstrates
synthetic cases, not new live publisher changes. The separate live API verification
is recorded below.

## Why the guards matter

- Domain checks reject lookalike hosts and credential-bearing URLs.
- Tracking parameters and fragments do not produce false new-link alerts.
- Empty, failed, malformed and off-domain-only responses leave the baseline untouched.
- Changed search scope is rejected before using search credits.
- Atomic replacement preserves the previous baseline when saving fails.
- Only selected evidence fields are stored. The API key and provider request URLs are excluded.

The tool never requests publisher pages. Search snippets are evidence of indexing, not proof of publisher facts.
Review the official page before acting. Concurrent writes to the same baseline are not supported.
This prototype is intended for public publisher searches, not private or personal queries.

## Verification

September 23, 2026: one live query to SerpApi returned 10 allowed `dst.gov.in` links.
Search ID: `6ab385411de0646c6802b17a`.
Eight regression tests cover domain boundaries, canonicalization, comparisons, failures, atomic storage and secret exclusion.
The local live baseline stays outside this repository. No private credentials are included.

## Entry status and assistance

This is a bounded integration prototype, not a completed contest entry.
The recorded demo is ready. Correct GitHub account access and sponsor-affiliation facts remain required.
The founder approved contest terms. No registration or submission receipt exists.
OpenAI Codex designed and implemented the code, tests and documentation with AI assistance.
No open-source license grant is made by this prototype.

Official contest: https://serpapi.github.io/serpapi-india-hackathon-2026/
API documentation: https://serpapi.com/search-api
