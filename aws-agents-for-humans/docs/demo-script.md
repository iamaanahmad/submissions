# Four-minute demo script

Keep the recording under five minutes. Use synthetic inputs and a warmed local model server.
Show actual command output; never replace a failed run with invented results.

## 0:00 to 0:30: the problem

"A project can look finished while its handoff evidence is incomplete.
Handoff Guard helps a small studio catch those gaps before it tells a client the work is ready."

Show the five-item synthetic manifest. Explain that test and approval states are declared inputs.

## 0:30 to 1:45: the blocked handoff

Generate a new blocked fixture and run `handoff-guard agent` against it.
Show the real Strands trace calling `inspect_delivery`, then `create_handoff`.
If CPU inference takes longer, disclose the elapsed time and use a labeled cut.
Show `handoff.md`: one verified item and four blocked items.
Point out the failed check, pending approval, missing file, and changed artifact.
Open `evidence/` and show that only the landing record was copied.

## 1:45 to 2:45: the clean handoff

Generate a separate fixture with `--clean` and run the agent again.
Explain that this simulates corrected evidence; the agent did not repair the underlying work.
Show five verified files and "READY FOR HUMAN REVIEW".
Open the unsent message draft. Nothing is emailed or deployed.

## 2:45 to 3:30: why use an agent

Show the architecture diagram.
"Strands coordinates the tools and a local model suggests next steps.
The model cannot override the evidence verdict. Python checks every copied file again."
Show the deterministic mode as a fallback, clearly separate from agent mode.

## 3:30 to 4:00: limits and next step

"This prototype checks supplied evidence, not the truth of every test or approval.
It runs locally without paid inference. Next, we would connect signed build evidence instead of manual declarations."

End with the repository link and an honest prototype label.
Record and publish only after the owner clears the entry's publication and legal requirements.
