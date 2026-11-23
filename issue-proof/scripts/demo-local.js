import { assessIssue, localToday } from '../src/checks.js';
import { fetchIssue } from '../src/issue-request.js';
import { handoffStatus } from '../src/handoff-status.js';

// Synthetic Jira data for reviewing the checker before an Atlassian account is connected.
const baseIssue = {
  id: '10001',
  key: 'DEMO-1',
  fields: {
    summary: 'Publish the judge walkthrough',
    description: 'Acceptance criteria: Five checks passed; the demo was uploaded and checked.',
    assignee: { accountId: 'demo-owner', displayName: 'Demo owner', active: true },
    duedate: '2026-12-20',
    issuetype: { subtask: false },
    subtasks: [],
    issuelinks: [],
    status: { name: 'Done', statusCategory: { key: 'done' } },
    resolution: { name: 'Done' }
  }
};

const blockedIssue = {
  ...baseIssue,
  id: '10002',
  key: 'DEMO-2',
  fields: {
    ...baseIssue.fields,
    summary: 'Send the judge walkthrough',
    description: 'Acceptance criteria: Five checks passed, but the demo was not uploaded.',
    status: { name: 'In progress', statusCategory: { key: 'indeterminate' } },
    resolution: null
  }
};

const staleLinkedIssue = {
  ...baseIssue,
  id: '10003',
  key: 'DEMO-3',
  fields: {
    ...baseIssue.fields,
    summary: 'Release the Jira change',
    issuelinks: [{
      type: { inward: 'is blocked by', outward: 'blocks' },
      inwardIssue: {
        id: '10004', key: 'DEMO-4',
        fields: { status: { name: 'Done', statusCategory: { key: 'done' } } }
      }
    }]
  }
};

const inactiveOwnerIssue = {
  ...baseIssue,
  id: '10005',
  key: 'DEMO-5',
  fields: {
    ...baseIssue.fields,
    summary: 'Hand off the finished Jira change',
    assignee: { accountId: 'former-owner', displayName: 'Former owner', active: false }
  }
};

export async function demoReports() {
  const today = new Date();
  const target = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 7);
  const dueDate = localToday(target);
  return Promise.all([baseIssue, blockedIssue, staleLinkedIssue, inactiveOwnerIssue].map(async (fixture) => {
    const issue = { ...fixture, fields: { ...fixture.fields, duedate: dueDate } };
    const requestJira = async (path) => ({
      ok: true,
      json: async () => path.includes('/issue/DEMO-4?')
        ? {
          id: '10004', key: 'DEMO-4',
          fields: { status: { name: 'In progress', statusCategory: { key: 'indeterminate' } }, resolution: null }
        }
        : structuredClone(issue)
    });
    const result = assessIssue(await fetchIssue(requestJira, issue.id, 15000, issue.id), localToday(today));
    const checkedAtMs = Date.now();
    const report = {
      ...result, checkedAtMs, checkedAtMonotonicMs: performance.now(),
      checkedDay: localToday(today), checkedManually: true,
      contextIssueId: issue.id, contextIssueKey: issue.key
    };
    const status = handoffStatus(report, {
      currentIssueId: issue.id, currentIssueKey: issue.key,
      today: localToday(today), now: checkedAtMs, monotonicNow: performance.now()
    });
    return {
      issue: issue.key,
      passed: result.passed,
      total: result.total,
      ready: status.ready,
      nextAction: status.nextAction
    };
  }));
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  console.log(JSON.stringify({ synthetic: true, reports: await demoReports() }, null, 2));
}
