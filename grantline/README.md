# Grantline

Grantline reviews a nonprofit's grant list and produces a ranked, source-linked shortlist. It checks date, region, program focus, funding amount, and duplicate IDs. It exports every decision as JSONL for audit. It never claims that a match proves eligibility.

**Contest status:** original code began October 22, 2026 after the published build window opened. This is a local demo and draft source. It is **not a submitted entry**. The sample data is fictional. Live Zetaris use, Cursor use, sponsor eligibility, public demo, slides, and platform receipt remain unverified.

## Run the demo

```sh
cd grantline
python3 server.py
# open http://127.0.0.1:4178
python3 -m unittest -v test_agent.py
```

Click **Load fictional sample** to exercise five records. The result should show two candidates and three exclusions. For real review, import your own CSV or JSON records. CSV headers: `id,title,funder,source_url,deadline,regions,focus,amount`. Dates use `YYYY-MM-DD`; `regions` and `focus` are comma-separated phrases. The local server does not persist uploaded data.

## Agent loop

1. Ingest source records and assign stable IDs.
2. Normalize facts and remove duplicate IDs.
3. Check hard eligibility constraints. Missing evidence fails closed.
4. Rank remaining leads by focus overlap, funding fit, and time to deadline.
5. Emit source-linked reasons and an exportable trace.

This follows the provenance, stable identity, and decision-trace pattern in [Meterless World Model](https://github.com/Meterless/Meterless/tree/main/engines/world-model). Grantline does not yet claim Meterless conformance or live runtime use.

## Zetaris path

`zetaris.py` has a read-only adapter for a configured Zetaris OpenSqlQuery endpoint. Set `ZETARIS_OPEN_SQL_URL` and `ZETARIS_ID_TOKEN` privately, then call `fetch_grants("SELECT * FROM grant_view")` from an authorized environment. Zetaris documents the `select` and `pageLimit` request fields in its [REST API guide](https://kbase.zetaris.com/knowledge/rest-api). Response shape and live access still need verification against an actual instance. The adapter does not run in the local sample flow.

## Entry gate

The [Open Agent Hackathon](https://hackathon.genai.works/event/open-agent-hackathon-2026) requires a working agent, actual Zetaris, Meterless, and Cursor use, public source, a demo video, a slide deck, and a submitted project. None of those third-party-use claims should be made from this local demo. A paid AWS compute cluster is not authorized for this entry.
