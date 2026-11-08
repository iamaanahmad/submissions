import test from 'node:test';
import assert from 'node:assert/strict';
import { assessIssue } from '../src/checks.js';

test('reports complete evidence without claiming release approval', () => {
  const report = assessIssue({ key: 'DEMO-7', fields: {
    summary: 'Ship the fix', assignee: { accountId: 'abc', displayName: 'Amaan' },
    duedate: '2026-12-01', description: { content: [{ content: [{ text: 'Acceptance criteria: buyer sees receipt' }] }] },
    subtasks: [{ fields: { status: { statusCategory: { key: 'done' } } } }]
  } }, '2026-11-07');
  assert.equal(report.passed, 4);
  assert.match(report.nextAction, /Review the actual work/);
  assert.match(report.note, /not a release approval/);
});

test('names missing evidence and unfinished subtasks', () => {
  const report = assessIssue({ key: 'DEMO-8', fields: {
    summary: 'Draft work', description: { content: [{ content: [{ text: 'A short description' }] }] },
    subtasks: [{ key: 'DEMO-8A', fields: { status: { statusCategory: { key: 'indeterminate' } } } }]
  } });
  assert.equal(report.passed, 0);
  assert.match(report.nextAction, /Assign someone/);
  assert.match(report.checks.find((check) => check.id === 'subtasks').detail, /Finish DEMO-8A before handoff/);
});

test('rejects an overdue target date and does not claim missing subtasks are complete', () => {
  const report = assessIssue({ key: 'DEMO-9', fields: {
    assignee: { accountId: 'abc' },
    duedate: '2026-11-06',
    description: 'Acceptance criteria: buyer sees a receipt',
    subtasks: []
  } }, '2026-11-07');
  assert.equal(report.passed, 2);
  assert.match(report.checks.find((check) => check.id === 'deadline').detail, /has passed/);
  assert.match(report.nextAction, /2026-11-06 due date has passed/);
  assert.match(report.checks.find((check) => check.id === 'subtasks').detail, /Add subtasks/);
});

test('does not count an empty acceptance heading as evidence', () => {
  const report = assessIssue({ fields: {
    description: { content: [{ content: [{ text: 'Acceptance criteria:' }] }] }
  } });
  assert.equal(report.checks.find((check) => check.id === 'acceptance').passed, false);
  assert.match(report.checks.find((check) => check.id === 'acceptance').detail, /specific result/);
});

test('does not treat placeholder acceptance criteria as a result', () => {
  for (const placeholder of ['to be determined', 'not applicable', 'coming soon']) {
    const report = assessIssue({ fields: {
      description: { type: 'doc', content: [{ type: 'paragraph', content: [
        { type: 'text', text: `Acceptance criteria: ${placeholder}` }
      ] }] }
    } });
    assert.equal(report.checks.find((check) => check.id === 'acceptance').passed, false, placeholder);
  }
});

test('does not treat a later section as acceptance evidence', () => {
  const report = assessIssue({ fields: {
    description: { type: 'doc', content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'Acceptance criteria:' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'Implementation notes: update the API and deploy it.' }] }
    ] }
  } });
  assert.equal(report.checks.find((check) => check.id === 'acceptance').passed, false);
});

test('does not count a later Jira heading as acceptance evidence', () => {
  const report = assessIssue({ fields: {
    description: { type: 'doc', content: [
      { type: 'heading', content: [{ type: 'text', text: 'Acceptance criteria' }] },
      { type: 'heading', content: [{ type: 'text', text: 'Deployment notes' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'Ship after review.' }] }
    ] }
  } });
  assert.equal(report.checks.find((check) => check.id === 'acceptance').passed, false);
});

test('accepts a specific result on the acceptance line', () => {
  const report = assessIssue({ fields: {
    description: { type: 'doc', content: [{ type: 'paragraph', content: [
      { type: 'text', text: 'Acceptance criteria: Buyer can download a receipt after checkout.' }
    ] }] }
  } });
  assert.equal(report.checks.find((check) => check.id === 'acceptance').passed, true);
});

test('accepts a specific result below an acceptance heading', () => {
  const report = assessIssue({ fields: {
    description: { type: 'doc', content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'Acceptance criteria:' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'Buyer can download a receipt after checkout.' }] }
    ] }
  } });
  assert.equal(report.checks.find((check) => check.id === 'acceptance').passed, true);
});

test('accepts a Jira heading followed by a bullet result', () => {
  const report = assessIssue({ fields: {
    description: { type: 'doc', content: [
      { type: 'heading', content: [{ type: 'text', text: 'Acceptance criteria' }] },
      { type: 'bulletList', content: [{ type: 'listItem', content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Buyer can download a receipt after checkout.' }] }
      ] }] }
    ] }
  } });
  assert.equal(report.checks.find((check) => check.id === 'acceptance').passed, true);
});

test('does not demand child subtasks from a Jira subtask', () => {
  const report = assessIssue({ key: 'DEMO-10', fields: {
    issuetype: { name: 'Sub-task', subtask: true },
    assignee: { accountId: 'abc' },
    duedate: '2026-12-01',
    description: 'Acceptance criteria: buyer sees a receipt',
    subtasks: []
  } }, '2026-11-07');
  assert.equal(report.total, 3);
  assert.equal(report.passed, 3);
  assert.equal(report.checks.some((check) => check.id === 'subtasks'), false);
  assert.match(report.nextAction, /All 3 checks/);
});

test('flags only unresolved issues that block this issue', () => {
  const report = assessIssue({ key: 'DEMO-11', fields: {
    issuelinks: [
      { type: { inward: 'is blocked by', outward: 'blocks' }, inwardIssue: {
        key: 'DEMO-4', fields: { status: { statusCategory: { key: 'indeterminate' } } }
      } },
      { type: { inward: 'is blocked by', outward: 'blocks' }, outwardIssue: {
        key: 'DEMO-12', fields: { status: { statusCategory: { key: 'indeterminate' } } }
      } },
      { type: { inward: 'is blocked by', outward: 'blocks' }, inwardIssue: {
        key: 'DEMO-3', fields: { status: { statusCategory: { key: 'done' } } }
      } }
    ]
  } });
  assert.match(report.checks.find((check) => check.id === 'blockers').detail, /DEMO-4/);
  assert.doesNotMatch(report.checks.find((check) => check.id === 'blockers').detail, /DEMO-12|DEMO-3/);
});
