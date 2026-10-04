# Sky Window v4 agent

This is a working adaptation of the GOSIM Agentic Observer Python example for
the October 2026 complete-project protocol. It keeps Sky Window's prior
coverage idea: confirmed progress across the sky changes a bounded target
preference. The agent uses public card data and its own feedback. It does not
read hidden weather or event truth.

The transport, telescope geometry, planner base, and two LLM advice stages
come from the [organizer's Python example](https://create.gosim.org/survey26/platform/resources),
published under CC BY-NC 4.0. `agent_core/window_policy.py` and its integration
in `agent_core/planner.py` are Sky Window's adaptation. The previous results-only
policy and its benchmarks remain in the parent directory for reference.

The first coverage setting scored 4,292.693 on local card L1, versus 4,458.556
for the unmodified example. We reduced its maximum sector preference from 12%
to 4% after a matched practice check. With model calls disabled, the revised
agent scored 4,501.564 on L1, 4,673.593 on L2, and 4,341.919 on L3. The
previous 12% setting scored 4,292.693, 4,013.478, and 4,072.207 on those
cards. All six runs completed. These local scores do not establish judged
performance or satisfy the contest's two-stage LLM requirement.

Run the local policy checks with `python3 -m unittest test_window_policy.py`.
For a protocol and score check, use the organizer's local runner on practice
card L1 and set `OBSERVER_MODEL_DISABLED=1`. This proves the protocol but is
not an award-eligible model-backed evaluation. For an eligible run, supply a
team-owned `OPENAI_API_KEY`, `OPENAI_BASE_URL`, and `OPENAI_MODEL` in the
platform's Keys and network settings. The model advises on forecasts and live
bulletins at separate stages. Never commit model keys or `.env`.

The project is not yet a contest entry. Registration still needs the entrant's
astronomy and AI levels and organizer-affiliation answer. A scored online
evaluation, final version choice, and platform receipt remain outstanding.
