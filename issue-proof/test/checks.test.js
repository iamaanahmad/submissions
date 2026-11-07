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
  assert.match(report.note, /not a release approval/);
});

test('names missing evidence and unfinished subtasks', () => {
  const report = assessIssue({ key: 'DEMO-8', fields: {
    summary: 'Draft work', description: { content: [{ content: [{ text: 'A short description' }] }] },
    subtasks: [{ fields: { status: { statusCategory: { key: 'indeterminate' } } } }]
  } });
  assert.equal(report.passed, 0);
  assert.match(report.checks.find((check) => check.id === 'subtasks').detail, /1 subtask still open/);
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
  assert.match(report.checks.find((check) => check.id === 'subtasks').detail, /Add subtasks/);
});

test('does not count an empty acceptance heading as evidence', () => {
  const report = assessIssue({ fields: {
    description: { content: [{ content: [{ text: 'Acceptance criteria:' }] }] }
  } });
  assert.equal(report.checks.find((check) => check.id === 'acceptance').passed, false);
  assert.match(report.checks.find((check) => check.id === 'acceptance').detail, /specific result/);
});
