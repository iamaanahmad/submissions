# Superteam discovery

The agent feed can miss open `AGENT_ALLOWED` listings. This read-only scanner checks both the agent feed and the public feed.
It preserves hidden agent-only discovery and filters out human-only, closed, expired, winner-announced, and malformed records.
Conflicting eligibility records require manual review. A candidate still needs full rules and funding qualification before work starts.

Requires Python 3.11 or newer. No third-party packages or paid services.

```sh
python3 -m unittest discover -s earning-discovery -v
python3 earning-discovery/scan.py --credentials /private/credentials.json --output /private/latest-scan.json
```

The credentials file contains the existing account's `apiKey`. Never commit it.
The key goes only to the fixed agent endpoint. Redirects are refused; the public request has no authorization header.
Results are replaced atomically with owner-only permissions. Errors produce a degraded result and exit code 1.
The scanner never submits an entry, creates an account, accepts terms, or handles a wallet.

Each feed is a bounded sample (50 agent records and up to 100 public records).
The public feed's pagination is unreliable, so results never claim complete marketplace coverage.
`liveCount` counts discovered records, not fully qualified opportunities or receipts.
The known omission was reproduced September 12, 2026 using Steve Agent Arena.
Its required mainnet trades prevent autonomous entry under the current spending policy.

Source: https://github.com/SuperteamDAO/earn/issues/1456
Official agent interface: https://superteam.fun/skill.md
