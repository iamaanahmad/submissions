# Issue Proof

When the browser reconnects, the panel checks the current Jira issue again. This also catches changes made while a prior report was visible and the connection was down. Manual Check again remains available.
While the browser is offline, the panel warns that a visible report may be out of date and withholds its success state. If Jira updates fail, a manual check restores the success state until another listener failure.
The panel also withholds handoff success when a check is more than five minutes old. It checks the clock every 15 seconds, so a clock change cannot leave an old passing result visible. Select **Check again** if a browser timer or Jira update was delayed.

Issue Proof is a Forge Jira issue panel for software teams. It reads the current issue and shows evidence checks for owner, target date, written acceptance criteria, and done status. Parent issues check their subtasks when they have any. Jira subtasks skip that child-work check. Open Jira checklist items and pasted unchecked boxes in the description block handoff, even outside acceptance criteria. When a linked issue blocks the current issue, the panel names it until its status is done. The panel highlights the first missing item as the next action. It does not change Jira data or claim release approval.

An inactive assigned Jira account cannot take the next step. Issue Proof blocks handoff until an active owner is assigned. An issue with no assignee account ID also needs an owner.
An issue closed as Won't Do, Duplicate, Cannot Reproduce, Out of Scope, Obsolete, or Abandoned is not completed work, so it cannot pass handoff.
If Jira omits or corrupts the issue resolution, Issue Proof asks for a retry instead of showing a passing handoff.

Unchecked examples inside Jira code blocks are ignored. Actual open Jira tasks and pasted checklists still block handoff.
Pasted Markdown code fences are also ignored, so examples cannot create false missing-work results.
Inline Markdown code examples are ignored for the same reason. Real unchecked checklist items still block handoff.

For written results, the panel accepts Acceptance criteria, Definition of done, Success criteria, and Done when headings. An empty heading does not count as evidence.
It accepts a colon or dash before a result on the same line.
Unfinished results such as TBC, WIP, pending review, missing receipts, and to be confirmed do not count as evidence.
An explicit "receipt was not saved" or "report not generated" also blocks handoff, even when tests passed.
Contracted failures such as "receipt wasn't saved" and "report hasn't been generated" also block handoff.
Zero failed results, such as "zero tests failed," do not block a completed check. A missing receipt on the same line still blocks handoff.
A failed demo upload, deployment, build, release, or handoff blocks acceptance even when local tests passed.
An action reported as not done, such as a demo not uploaded or release not published, also blocks acceptance.
The same rule covers actions marked never done or still not done.
Planned results such as "the receipt will be saved" or "checks should pass" do not count as completed proof.
The same rule applies to standalone Given / When / Then scenarios.
Partial test results, such as two of five checks passing, do not count as finished acceptance proof.
The same applies when Jira notes put the result label first, such as "tests passed: 2/5."
When a line lists several result ratios, every ratio must be complete. A complete test count cannot hide missing receipts later on the same line.
Zero completed tests, scenarios, or receipts do not count as finished proof, even when the line says they passed or were saved.
Zero tallies after a label, such as "tests passed: 0" or "receipts saved: 0", also block handoff.
Numbered failed tests, missing receipts, and failed scenarios also block acceptance, even when another count says checks passed. The check also rejects phrases such as "one test failed" and "1 failed test."
Written counts such as "two tests failed" and "all receipt checks failed" block acceptance too.
Present-tense failures such as "one test fails" and "checks fail: 1" block acceptance too.
Skipped tests, checks, cases, or scenarios also block acceptance until they run.
Nonzero pending, blocked, incomplete, or unverified result counts also block acceptance.
The check also rejects reversed counts such as "2 skipped checks" and "checks skipped, two."
Failed or zero-result Given / When / Then scenarios cannot count as acceptance evidence.
Missing judge proof also blocks acceptance. A missing video, screenshot, demo link, installation link, or unavailable published build cannot hide behind passing tests.
If an issue has several acceptance or definition-of-done sections, every section needs a specific result. An empty later section blocks handoff.
Mixed summaries such as "5 checks passed, 1 failed" also block acceptance.
Test suite errors such as "5 passed, 1 error" also block acceptance.
Checks marked not run, not executed, untested, or skipped also block acceptance, even without a count.
Delivery results still in progress, underway, incomplete, or not started also block acceptance.
Summaries such as "all checks passed except one" or "all checks pass except one" also block acceptance.
Failed result ratios, such as "2/5 checkout tests failed," also block acceptance.
Unnumbered failures, such as "the buyer check failed," also block acceptance.
Implementation steps below an empty acceptance heading do not count as acceptance results.
Given / When / Then examples inside implementation notes do not count as acceptance results either.

## Run locally

Open issues with past target dates need a new date. Completed issues keep their original target date as evidence.
The target-date check uses the viewer's local calendar day, so dates do not turn overdue early across time zones.

```sh
npm install
npm run check
npm run demo:local
```

The local walkthrough prints one ready issue and one blocked issue from synthetic Jira data. It does not test Forge installation or live Jira access.

Use Node.js 22.23.4 or newer in the supported 22.x line, or another version in `package.json`'s engine range. `npm run check` runs local tests. After the app owner registers the app, `npm run lint:forge` checks the Forge manifest. Forge registration and installation require the app owner's Atlassian account.

## Install in Jira

Use an Atlassian developer account and a Jira Cloud development site. Run `forge login`, then `forge register`, `forge deploy`, and `forge install`. Forge registration adds the app ID to `manifest.yml`; no account ID or secret belongs in this repository. Open any Jira issue and select **Issue Proof** in its issue panel.

The app uses the current viewer's Jira permissions and the `read:jira-work` scope. A viewer without access sees an error, not another user's issue data. No external API or paid service is required.
If Jira sign-in expires, the panel asks the viewer to sign in again before checking the issue.
If Jira returns an incomplete issue, the panel asks for a retry instead of treating absent fields as missing handoff evidence.
If Jira returns an unreadable reply, the panel gives a retry action instead of exposing a parser error.
If the Jira request fails or returns no response, the panel gives a retry action instead of exposing an internal error.
Jira may leave owner, target date, or description empty. Those fields must still appear in the reply, so missing data triggers a retry instead of a false missing-evidence result.
Malformed owner, target date, or description data also triggers a retry instead of a false missing-evidence result. Jira must confirm whether an assigned owner is active before handoff can pass.
Missing subtask or issue-link lists also trigger a retry. The panel does not treat an incomplete Jira reply as proof that no work is blocked.
Subtasks and linked issues must include their Jira status. Missing status data triggers a retry instead of a misleading blocker result.

The panel refreshes its checks after the current Jira issue changes. The **Check again** button remains available for changes that Jira does not send to an open panel.
The panel also checks again when a hidden Jira tab becomes visible, so a handoff report does not rely on background events that the browser may have missed.
When you return to the Jira window, the panel checks again. This catches linked work that changed even a few seconds after the prior check.
While the tab stays open, it checks every five minutes. This catches completed subtasks and linked blockers that do not send a change event for the current issue.
If Jira's change listener cannot start, the panel warns that the report may be stale and asks the viewer to check again before handoff.
If Jira sends an incomplete change notice for the current issue, the panel also withholds a passing handoff state until a manual recheck.
The panel requests the issue by its stable Jira ID when available. If Jira changes the issue key after a move, the panel shows the current key and its checks.
If Jira returns a different issue ID, the panel asks for a retry instead of showing another issue's evidence.

## Contest status

This is the first testable source advance for Codegeist 2026. A real Forge deployment, Jira install, judge installation link, public demo video, entrant facts, Devpost sign-in, and submission receipt are still required before entry.
