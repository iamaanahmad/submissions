import { assessIssue, localToday } from '../src/checks.js';

// Synthetic Jira data for reviewing the checker before an Atlassian account is connected.
const baseIssue = {
  id: '10001',
  key: 'DEMO-1',
  fields: {
    summary: 'Publish the judge walkthrough',
    description: 'Acceptance criteria: Five checks passed; the demo was uploaded and checked.',
    assignee: { accountId: 'demo-owner', displayName: 'Demo owner' },
    duedate: '2026-12-20',
    issuetype: { subtask: false },
    subtasks: [],
    issuelinks: [],
    status: { name: 'Done', statusCategory: { key: 'done' } }
  }
};

const blockedIssue = {
  ...baseIssue,
  key: 'DEMO-2',
  fields: {
    ...baseIssue.fields,
    summary: 'Send the judge walkthrough',
    description: 'Acceptance criteria: Five checks passed, but the demo was not uploaded.',
    status: { name: 'In progress', statusCategory: { key: 'indeterminate' } }
  }
};

export function demoReports() {
  const today = new Date();
  const target = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 7);
  const dueDate = localToday(target);
  return [baseIssue, blockedIssue].map((issue) => {
    const result = assessIssue({ ...issue, fields: { ...issue.fields, duedate: dueDate } }, localToday(today));
    return {
      issue: issue.key,
      passed: result.passed,
      total: result.total,
      ready: result.passed === result.total,
      nextAction: result.nextAction
    };
  });
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  console.log(JSON.stringify({ synthetic: true, reports: demoReports() }, null, 2));
}
