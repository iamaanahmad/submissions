# Issue Proof

Issue Proof is a Forge Jira issue panel for software teams. It reads the current issue and shows evidence checks for owner, target date, written acceptance criteria, and done status. Parent issues check their subtasks when they have any. Jira subtasks skip that child-work check. Open Jira checklist items and pasted unchecked boxes in the description block handoff, even outside acceptance criteria. When a linked issue blocks the current issue, the panel names it until its status is done. The panel highlights the first missing item as the next action. It does not change Jira data or claim release approval.

## Run locally

Open issues with past target dates need a new date. Completed issues keep their original target date as evidence.

```sh
npm install
npm test
```

## Install in Jira

Use an Atlassian developer account and a Jira Cloud development site. Run `forge login`, then `forge register`, `forge deploy`, and `forge install`. Forge registration adds the app ID to `manifest.yml`; no account ID or secret belongs in this repository. Open any Jira issue and select **Issue Proof** in its issue panel.

The app uses the current viewer's Jira permissions and the `read:jira-work` scope. A viewer without access sees an error, not another user's issue data. No external API or paid service is required.

## Contest status

This is the first testable source advance for Codegeist 2026. A real Forge deployment, Jira install, judge installation link, public demo video, entrant facts, Devpost sign-in, and submission receipt are still required before entry.
