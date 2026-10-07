# Flat Finish

An experimental paper-only decision server for the [YeNo × Builderr Volume Bot Challenge](https://builderr.ai/api/challenge/yeno-volume-bots).

**Not submitted. Not benchmarked on market replay. No qualification or profitability claim.**

Flat Finish separates entry filtering from inventory exit. It rejects future or stale reference inputs, waits for two agreeing observations, and only buys when visible full-depth resale covers both fees plus a one-cent buffer. It requests SELL whenever it owns inventory, including partial-depth and one-sided expiry books. The evaluator determines whether that request fills. There is no guarantee of a flat finish.

This is original implementation code informed by the public evaluator contract. It does not copy or bundle the organizer's House Bot. No exchange API, wallet, key, deposit or real-order path exists.

## Run

Python 3.11 or newer; no third-party packages.

```sh
python3 flat-finish/bot.py
# POST JSON to http://127.0.0.1:8080/decide
python3 -m unittest discover -s flat-finish -v
```

Use one process per evaluation session. The serial server prevents shared strategy state races. Request bodies are limited to 64 KiB. Malformed observations return HOLD; invalid JSON returns HTTP 400.

## Evidence and limits

Thirty-one tests cover future references, partial exits, pending actions, fee-inclusive cash limits, order minimums, insufficient depth, target stopping and the HTTP interface. Test quotes are synthetic. The BUY fixture deliberately uses a crossed book so it exercises an actionable branch. Such opportunities may be absent in real receive-time data. A normal spread returns HOLD. This policy may trade too little to qualify.

The current public kit supplies no replay dataset or evaluator implementation. A local synthetic diagnostic now covers 288 five-minute sessions. No real market replay result exists. Do not submit until a realistic replay demonstrates sufficient volume and a flat finish under the official latency and fill rules. Fixing input and exit behavior does not prove greater volume or cash.

The official example omits per-book timestamps and pending-order fields. Optional `observedAt` timestamps are checked when supplied. Common explicit pending-action fields block orders. Otherwise the evaluator must enforce its documented two-second quote limit and one-pending-action rule. Confirm the exact production observation schema before final integration.

The evaluator owns cash, shares, completed-cycle volume, 250 ms future-book execution, split fills, settlement and ranking. This server never writes or calculates an official score. SELL retries do not create volume. Only the evaluator can determine whether a cycle closed.

## Submission gate

The [official contract](https://builderr.ai/downloads/yeno-evaluator-contract.md) requires $1,000 completed volume from $10 simulated cash within 24 hours. Each BUY includes fees within a $5 maximum. Finish flat with no pending action. Submit only after realistic development validation, using a pinned revision and the permitted submission route. Optional live pilots are outside this project.

## Local replay diagnostic

```sh
python3 flat-finish/replay.py --synthetic normal
python3 flat-finish/replay.py --synthetic crossed
python3 flat-finish/replay.py --input normalized.jsonl --start 1789880800
```

The diagnostic has no network access. It implements receive-time processing, a
250 ms order delay, same-outcome book updates, fee-inclusive BUY budgets, depth
limits, partial exits and completed-cycle volume. Expired inventory remains
stranded. It cannot earn volume through settlement or another market's book.

The JSONL input is **our own normalized schema**, not an official file format.
Each row contains `timestamp`, `market` (`id`, `opensAt`, `closesAt`, `complete`),
`outcome`, `book` (`observedAt`, `minOrderSize`, `bids`, `asks`) and optional
`reference` matching the decision API. Prices and sizes are pairs. Mark a market
complete only after auditing recorder coverage. Pre-open, incomplete, stale-book,
future-target and out-of-window rows do not execute orders. Input must be in
chronological receive-time order. `synthetic()` is a runnable format example.

### What the diagnostic found

Both fixtures contain 288 synthetic sessions spanning a 24-hour window. They are
controlled examples, **not market data or performance estimates**.

| Synthetic fixture | Closed cycles | Eligible local volume | Ending cash | Fees | Terminal shares |
|---|---:|---:|---:|---:|---:|
| Normal spread: ask 0.50, bid 0.49 | 0 | $0.00 | $10.00 | $0.00 | 0 |
| Crossed control: ask 0.50, bid 0.56 | 189 | $1,001.70 | $23.84614 | $42.85386 | 0 |

The crossed control stops with no pending order after the first clean target
crossing at 56,462 seconds. It tests accounting and stopping, not competitiveness.

The current strategy cannot enter a normal, uncrossed book: selling immediately
returns no more gross cash than buying costs, and both sides charge positive
fees. Its entry rule requires resale proceeds above purchase cost and fees.
Therefore the observed zero-trade result is structural, not a parameter problem.
Do not tune the crossed fixture or submit this strategy as a competitive entry.
The next strategy needs a tested reason to expect a *later* price improvement,
using timestamped development market data and separate evaluation data.

### Differences from the official evaluator

The organizer has not supplied its evaluator implementation or replay dataset in
the inspected public resources. This tool does not claim equivalence. It assumes
immediate-or-cancel fills at the first eligible own-outcome update, uses rounded
aggregate protocol fees and rounded overlay fees, rounds shares down to six
decimal places, and permits residual SELL fills below the BUY minimum. Those
rounding and dust details need official confirmation. It trusts the caller's
`complete` flag; it does not detect recorder outages or reconstruct sessions.
It does not model settlement, market redemption, official mark-to-market drawdown
or ranking. Missing last fills leave pending orders or inventory unresolved.
`local_target_met` is a fixture diagnostic, never an official qualification claim.
