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

Eighteen tests cover future references, partial exits, pending actions, fee-inclusive cash limits, order minimums, insufficient depth, target stopping and the HTTP interface. Test quotes are synthetic. The BUY fixture deliberately uses a crossed book so it exercises an actionable branch. Such opportunities may be absent in real receive-time data. A normal spread returns HOLD. This policy may trade too little to qualify.

The current public kit supplies no replay dataset or evaluator implementation. No 24-hour replay result exists for this project. Do not submit until a realistic replay demonstrates sufficient volume and a flat finish under the official latency and fill rules. Fixing input and exit behavior does not prove greater volume or cash.

The official example omits per-book timestamps and pending-order fields. Optional `observedAt` timestamps are checked when supplied. Common explicit pending-action fields block orders. Otherwise the evaluator must enforce its documented two-second quote limit and one-pending-action rule. Confirm the exact production observation schema before final integration.

The evaluator owns cash, shares, completed-cycle volume, 250 ms future-book execution, split fills, settlement and ranking. This server never writes or calculates an official score. SELL retries do not create volume. Only the evaluator can determine whether a cycle closed.

## Submission gate

The [official contract](https://builderr.ai/downloads/yeno-evaluator-contract.md) requires $1,000 completed volume from $10 simulated cash within 24 hours. Each BUY includes fees within a $5 maximum. Finish flat with no pending action. Submit only after realistic development validation, using a pinned revision and the permitted submission route. Optional live pilots are outside this project.
