# Issue Proof

Issue Proof is a Forge Jira issue panel for software teams. It reads the current issue and shows evidence checks for owner, target date, written acceptance criteria, and done status. Parent issues check their subtasks when they have any. Jira subtasks skip that child-work check. Open Jira checklist items and pasted unchecked boxes in the description block handoff, even outside acceptance criteria. When a linked issue blocks the current issue, the panel names it until its status is done. The panel highlights the first missing item as the next action. It does not change Jira data or claim release approval.

An assigned Jira account remains the recorded owner after deactivation. Issue Proof shows that state without failing the owner check. An issue with no assignee account ID still needs an owner.

Unchecked examples inside Jira code blocks are ignored. Actual open Jira tasks and pasted checklists still block handoff.
Pasted Markdown code fences are also ignored, so examples cannot create false missing-work results.
Inline Markdown code examples are ignored for the same reason. Real unchecked checklist items still block handoff.

For written results, the panel accepts Acceptance criteria, Definition of done, Success criteria, and Done when headings. An empty heading does not count as evidence.
It accepts a colon or dash before a result on the same line.
Unfinished results such as TBC, WIP, pending review, missing receipts, and to be confirmed do not count as evidence.
Partial test results, such as two of five checks passing, do not count as finished acceptance proof.
Zero completed tests, scenarios, or receipts do not count as finished proof, even when the line says they passed or were saved.
Numbered failed tests, missing receipts, and failed scenarios also block acceptance, even when another count says checks passed. The check also rejects phrases such as "one test failed" and "1 failed test."
Written counts such as "two tests failed" and "all receipt checks failed" block acceptance too.
Present-tense failures such as "one test fails" and "checks fail: 1" block acceptance too.
Skipped tests, checks, cases, or scenarios also block acceptance until they run.
Failed or zero-result Given / When / Then scenarios cannot count as acceptance evidence.
If an issue has several acceptance or definition-of-done sections, every section needs a specific result. An empty later section blocks handoff.
Mixed summaries such as "5 checks passed, 1 failed" also block acceptance.
Failed result ratios, such as "2/5 checkout tests failed," also block acceptance.
Implementation steps below an empty acceptance heading do not count as acceptance results.
Given / When / Then examples inside implementation notes do not count as acceptance results either.

## Run locally

Open issues with past target dates need a new date. Completed issues keep their original target date as evidence.

```sh
npm install
npm run check
```

Use Node.js 22.23.4 or newer in the supported 22.x line, or another version in `package.json`'s engine range. `npm run check` runs local tests. After the app owner registers the app, `npm run lint:forge` checks the Forge manifest. Forge registration and installation require the app owner's Atlassian account.

## Install in Jira

Use an Atlassian developer account and a Jira Cloud development site. Run `forge login`, then `forge register`, `forge deploy`, and `forge install`. Forge registration adds the app ID to `manifest.yml`; no account ID or secret belongs in this repository. Open any Jira issue and select **Issue Proof** in its issue panel.

The app uses the current viewer's Jira permissions and the `read:jira-work` scope. A viewer without access sees an error, not another user's issue data. No external API or paid service is required.
If Jira returns an incomplete issue, the panel asks for a retry instead of treating absent fields as missing handoff evidence.
Jira may leave owner, target date, or description empty. Those fields must still appear in the reply, so missing data triggers a retry instead of a false missing-evidence result.
Missing subtask or issue-link lists also trigger a retry. The panel does not treat an incomplete Jira reply as proof that no work is blocked.
Subtasks and linked issues must include their Jira status. Missing status data triggers a retry instead of a misleading blocker result.

The panel refreshes its checks after the current Jira issue changes. The **Check again** button remains available for changes that Jira does not send to an open panel.
The panel requests the issue by its stable Jira ID when available. If Jira changes the issue key after a move, the panel shows the current key and its checks.
If Jira returns a different issue ID, the panel asks for a retry instead of showing another issue's evidence.

## Contest status

This is the first testable source advance for Codegeist 2026. A real Forge deployment, Jira install, judge installation link, public demo video, entrant facts, Devpost sign-in, and submission receipt are still required before entry.
