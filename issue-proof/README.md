# Issue Proof

Issue Proof is a Forge Jira issue panel for software teams. It reads the current issue and shows four evidence checks: owner, target date, written acceptance criteria, and completed subtasks. It does not change Jira data or claim release approval.

## Run locally

```sh
npm install
npm test
```

## Install in Jira

Use an Atlassian developer account and a Jira Cloud development site. Run `forge login`, then `forge register`, `forge deploy`, and `forge install`. Forge registration adds the app ID to `manifest.yml`; no account ID or secret belongs in this repository. Open any Jira issue and select **Issue Proof** in its issue panel.

The app uses the current viewer's Jira permissions and the `read:jira-work` scope. A viewer without access sees an error, not another user's issue data. No external API or paid service is required.

## Contest status

This is the first testable source advance for Codegeist 2026. A real Forge deployment, Jira install, judge installation link, public demo video, entrant facts, Devpost sign-in, and submission receipt are still required before entry.
