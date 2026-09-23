# Sky Window

A free, deterministic telescope scheduler for [GOSIM Agentic Observer](https://create.gosim.org/survey26/platform/).
It chooses among legal observations using current gain, confirmed coverage, and remaining viewing time.
It uses no model key, network call, or hidden scenario data.

## Current status

Working local entry, **not registered or submitted**. Registration requires the entrant's astronomy and AI experience levels.
Award eligibility also excludes organizers, evaluation-platform maintainers, and their immediate collaborators.
The live [rules](https://create.gosim.org/survey26/platform/rules) currently open judged submissions
**October 4, 2026 at 16:00 UTC**, closing October 7 at 15:59 UTC. Awards are October 17.
Playground scores do not qualify as judged submissions. Recheck the live phase table before uploading.

The organizer supplies a coding-assistant guide in its starter kit. Ordinary local development is available now.
Prize acceptance can be remote. No registration fee or paid model is needed.

## Local evidence

Same official runner, scorer, time budget, and scenario for each pair. No strategy fallback occurred.
All six runs reached `survey_complete`. Scores are local evidence, not a predicted rank or win.

| Scenario | Nights | Starter | Sky Window | Change |
|---|---:|---:|---:|---:|
| Published dev reference | 180 | 12,287.478365 | 12,281.384139 | -0.05% |
| Published finals preview | 7 | 8,214.257133 | 9,353.018251 | +13.86% |
| Generated seed 29, finals settings | 90 | 16,019.115685 | 16,157.905325 | +0.87% |

The strategy was fixed before the 90-night scenario ran. In the seven-night preview,
missed required tiles fell from one to zero. Both 90-night runs completed all 64 tiles.
Both inherited a 150-point wrong-tag penalty from the organizer's anomaly detector.
The small practice regression is retained and disclosed, rather than selecting only winning scores.
Raw score and completion fields are in [results.json](results.json).

## Unseen-weather validation

With the strategy unchanged, six matched runs completed on September 23 across three new 90-night scenarios.
Seeds 41, 73 and 101 were selected before any scores were read. Each run completed all 64 tiles.
There were no missing required tiles or strategy fallbacks.

| Seed | Starter | Sky Window | Change |
|---|---:|---:|---:|
| 41 | 19,737.434672 | 19,758.025208 | +0.10% |
| 73 | 21,955.999067 | 21,974.180033 | +0.08% |
| 101 | 20,693.916248 | 20,764.861542 | +0.34% |

The combined score rose 0.18% against the starter. All three gains were small; this does not establish a competitive lead.
These are local comparisons, not new gains from a strategy change and not platform submissions.
The original reference regression remains disclosed above. Full scores and the frozen strategy hash are in
[unseen-results.json](unseen-results.json). These seeds are now used validation data, not fresh holdouts.

## Reproduce

Use Python 3.12, matching the platform runtime. The strategy also runs on Python 3.11.

```sh
python3 -m unittest discover -s sky-window -v
python3 sky-window/benchmark.py --output sky-window-rerun.json
```

The benchmark downloads the official kit into a temporary directory, checks its SHA-256,
then compares the unchanged starter against our strategy. It generates the 90-night seed-29 scenario
from the supplied finals-preview configuration. It removes downloaded code and temporary runs afterward.
Allow several minutes. `--kit-zip /path/to/kit.zip` reuses a download with the same verified hash.
A changed organizer kit stops the run until its rules and protocol have been checked.

To test a fixed strategy on more weather, preselect new seeds and run:

```sh
python3 sky-window/benchmark.py --seeds 41 73 101 --days 90 --generated-only --output unseen-results.json
```

`--generated-only` skips the two published scenarios. Without these options, the original six-run comparison remains unchanged.
The report includes the strategy hash, seeds, duration, every paired score, and aggregate wins/losses/ties.
Duplicate seeds and existing output paths are rejected to avoid inflating comparisons or overwriting evidence.
Choose unused seeds for future validation; a seed stops being unseen after its first evaluation.
No aggregate result predicts hidden-platform rank, prize eligibility, or payment.

Only our strategy, tests, benchmark driver, and measured results are distributed here.
The official engine, wrapper, and anomaly detector remain organizer-supplied dependencies.
No rights to redistribute the starter kit are assumed.

## Entry artifact

[my_strategy.py](my_strategy.py) implements the organizer's `choose_action(candidates, snapshot, memory)` interface.
Install it as `agent/my_strategy.py` in the official starter kit. The platform's beginner upload path
accepts a `my_strategy.py` strategy and supplies its wrapper; verify this on the current upload page.
If that path changes, do not upload this hook as a standalone JSONL executable.
The [official getting-started guide](https://create.gosim.org/survey26/platform/start) explains both paths.

## Verify the upload files

```sh
python3 sky-window/prepare_entry.py --output /tmp/sky-window-entry
```

Use a new output directory. `--kit-zip /path/to/kit.zip` avoids downloading again.
The command checks the official kit hash, installs our strategy, and uses the official packager.
It unpacks the result and runs both the 180-night reference and seven-night finals preview
in a fresh Python environment with no third-party packages or inherited credentials.
It rejects incomplete runs, strategy fallback, and accidental model-provider configuration.
This is a local compatibility check, not the platform's sandbox or an online submission.

Only three files survive verification:

- `my_strategy.py`: upload as **Agent run** during the online judged phase.
- `dev-reference-decisions.csv`: upload as **Results file** for the matching practice scenario only.
- `verification.json`: strategy and kit hashes, interpreter version, scores, and completion status.

The live getting-started guide distinguishes these phase-specific routes. Practice does not count as a judged entry.
The command never registers or uploads. It deletes the temporary wrapper package and runtime after checking them.
Only our single strategy file goes to the judged upload; no organizer wrapper is redistributed here.

## Approach and limits

- Prefer gain per exposure second, with a maximum 15% preference for windows closing soon.
- Estimate coverage effects using confirmed completed tile IDs, not attempted observations.
- Keep each tile's best reported score. Repeated feedback and weaker repeats never inflate the ledger.
- Return only supplied legal candidates. With none, wait.
- Leave anomaly reporting and protocol validation to the official wrapper.

Coverage uses the regions seen in public snapshots and realized scores that include program bonuses.
It is a ranking heuristic, not an exact forecast of the final coverage reward.
Weather may change during an exposure. The policy cannot see future weather or guarantee completion.
The organizer's score constants are provisional. Local seed-29 results are no longer an untouched
holdout for future tuning; use new seeds for subsequent validation.

## AI assistance

An OpenAI coding agent implemented this scheduling policy, tests, and benchmark driver for Amaan Ahmad.
The official wrapper contributes candidate estimates, protocol handling, and anomaly detection.
