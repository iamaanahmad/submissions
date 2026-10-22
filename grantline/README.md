# Grantline

Grantline reviews a nonprofit's grant list and produces a ranked, source-linked shortlist. It checks date, region, program focus, funding amount, and duplicate IDs. It exports every decision as JSONL for audit. It never claims that a match proves eligibility.

**Contest status:** original code began October 22, 2026 after the published build window opened. This is a local demo and draft source. It is **not a submitted entry**. The sample data is fictional. The Meterless World Model reference runs locally for each review. Live Zetaris use, authenticated Cursor use, sponsor eligibility, public video, and platform receipt remain unverified.

## Run the demo

```sh
cd grantline
# Python 3.11+ and Node 20+ are required.
python3 server.py
# open http://127.0.0.1:4178
python3 -m unittest -v test_agent.py test_server.py
```

Click **Load fictional sample** to exercise five records. The result should show two candidates and three exclusions. Open **Inspect evidence and next step** on any result to see the fields and action behind its decision. Fictional results carry a warning and no source link. For real review, import your own CSV or JSON records. CSV headers: `id,title,funder,source_url,deadline,regions,focus,amount,applicant_types`. Dates use `YYYY-MM-DD`; `regions`, `focus`, and `applicant_types` are comma-separated phrases. Missing nonprofit applicant evidence sends a record to source review. The local server does not persist uploaded data.

Click **Search live grants** after entering a program focus to fetch up to six posted notices from the public [Grants.gov API](https://www.grants.gov/api/common/search2). The app also fetches each notice's details, including award ceiling, applicant types, and funding categories. It links every record to its source. Notices with explicit applicant types that exclude nonprofits are excluded. An ambiguous “Others” category needs source review. Other notices stay in **Need review** until the operator checks geographic and program fit against the original notice. Funding categories are shown as evidence, not treated as a match to the organization's focus. The app displays the [required Grants.gov attribution](https://www.grants.gov/api/terms-conditions) during live search. This search is read-only and requires no account.

For a live notice under **Need review**, open **Inspect evidence and next step**, read the original notice, and enter its eligible regions, program focus, applicant types, and a source note. Grantline will not call a live notice a candidate until its applicant types include nonprofits. It reruns the full review and tags operator-entered fields. The note appears in the exported trace. A resulting candidate remains a lead; the operator must confirm full eligibility before applying. These notes stay in the browser session and are not stored by the server.
Only fields that the operator changes are tagged as operator-entered. Other fields keep their imported provenance, even when the record has a source note.

## Agent loop

1. Ingest source records and assign stable IDs.
2. Normalize facts and remove duplicate IDs.
3. Check hard eligibility constraints. Missing source facts require review and never count as matches.
4. Rank remaining leads by focus overlap, funding fit, and time to deadline.
5. Emit source-linked reasons and an exportable trace.

Each review also runs the local [Meterless World Model reference](https://github.com/Meterless/Meterless/tree/main/engines/world-model/reference). It writes a grant entity, a separate review entity, the review's status and reasons as facts, and source-linked relations. Distinct reviews remain visible when the source list repeats a grant ID. The response includes the World Model snapshot for inspection. This proves local use of the public reference, not a hosted Meterless deployment or sponsor certification.

The vendored Apache 2.0 reference comes from Meterless commit `1742dec56a66e58eef9dda2d2b865823758ca8cd`. Its license is in `vendor/meterless/LICENSE`. The runnable bundle is built from the vendored TypeScript with:

```sh
esbuild vendor/meterless/src/index.ts --bundle --platform=node --format=esm --target=node20 --outfile=vendor/meterless/world-model.mjs
```

## Zetaris path

`zetaris.py` has a read-only adapter for a configured Zetaris OpenSqlQuery endpoint. Set `ZETARIS_OPEN_SQL_URL`, `ZETARIS_ID_TOKEN`, and `ZETARIS_GRANTS_QUERY` privately. The query must be a read-only `SELECT` from an authorized grant view. Click **Load Zetaris grant view**, then run the evidence review. The server keeps the token private and returns a clear error when access is absent. Zetaris documents the `select` and `pageLimit` request fields in its [REST API guide](https://kbase.zetaris.com/knowledge/rest-api). Response shape and live access still need verification against an actual instance; no live sponsor call is claimed yet.

## Entry gate

The [Open Agent Hackathon](https://hackathon.genai.works/event/open-agent-hackathon-2026) requires a working agent, sponsor technology use, public source, a demo video, a slide deck, and a submitted project. Meterless local reference use is verified. Zetaris and Cursor use are not. A paid AWS compute cluster is not authorized for this entry.

The four-page draft deck is [slides.pdf](slides.pdf). Its last page names the checks still open. Update the deck after any verified sponsor use before submitting it.
