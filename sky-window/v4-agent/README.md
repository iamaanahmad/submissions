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

On official practice card L1, both agents completed the survey with model calls
disabled. Sky Window scored 4,292.693; the unmodified example scored 4,458.556.
The adaptation trails by 3.72% on this card. These local scores do not establish
judged performance. Keep this result visible while improving the policy.

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
