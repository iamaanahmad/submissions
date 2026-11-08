import test from 'node:test';
import assert from 'node:assert/strict';
import { assessIssue } from '../src/checks.js';

test('reports complete evidence without claiming release approval', () => {
  const report = assessIssue({ key: 'DEMO-7', fields: {
    summary: 'Ship the fix', status: { name: 'Done', statusCategory: { key: 'done' } }, assignee: { accountId: 'abc', displayName: 'Amaan' },
    duedate: '2026-12-01', description: { content: [{ content: [{ text: 'Acceptance criteria: buyer sees receipt' }] }] },
    subtasks: [{ fields: { status: { statusCategory: { key: 'done' } } } }]
  } }, '2026-11-07');
  assert.equal(report.passed, 5);
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

test('does not accept an inactive Jira assignee as the handoff owner', () => {
  const report = assessIssue({ key: 'DEMO-14', fields: {
    assignee: { accountId: 'former-user', displayName: 'Former owner', active: false },
    duedate: '2026-12-01',
    description: 'Acceptance criteria: buyer receives a receipt after checkout',
    status: { name: 'Done', statusCategory: { key: 'done' } },
    subtasks: [{ fields: { status: { statusCategory: { key: 'done' } } } }]
  } }, '2026-11-08');
  assert.equal(report.passed, 4);
  assert.match(report.nextAction, /Assign an active owner/);
});

test('rejects an overdue target date without requiring optional subtasks', () => {
  const report = assessIssue({ key: 'DEMO-9', fields: {
    assignee: { accountId: 'abc' },
    duedate: '2026-11-06',
    description: 'Acceptance criteria: buyer sees a receipt',
    subtasks: []
  } }, '2026-11-07');
  assert.equal(report.passed, 2);
  assert.match(report.checks.find((check) => check.id === 'deadline').detail, /has passed/);
  assert.match(report.nextAction, /2026-11-06 due date has passed/);
  assert.equal(report.checks.some((check) => check.id === 'subtasks'), false);
});

test('an ordinary completed issue can pass without creating child subtasks', () => {
  const report = assessIssue({ key: 'DEMO-15', fields: {
    summary: 'Update the checkout label',
    status: { name: 'Done', statusCategory: { key: 'done' } },
    assignee: { accountId: 'abc', active: true },
    duedate: '2026-12-01',
    description: 'Acceptance criteria: Buyer sees the updated checkout label.'
  } }, '2026-11-08');
  assert.equal(report.passed, 4);
  assert.equal(report.total, 4);
  assert.equal(report.checks.some((check) => check.id === 'subtasks'), false);
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

test('does not let a later scenario override placeholder acceptance criteria', () => {
  const report = assessIssue({ fields: {
    description: { type: 'doc', content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'Acceptance criteria: TBD' }] },
      { type: 'heading', content: [{ type: 'text', text: 'Implementation notes' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'Given a local mock when the test runs then the fixture returns a response.' }] }
    ] }
  } });
  assert.equal(report.checks.find((check) => check.id === 'acceptance').passed, false);
});

test('does not count an unfinished note inside a longer acceptance result', () => {
  const report = assessIssue({ fields: {
    description: { type: 'doc', content: [
      { type: 'heading', content: [{ type: 'text', text: 'Acceptance criteria' }] },
      { type: 'bulletList', content: [
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Buyer receives a receipt after checkout.' }] }] },
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'The retry flow is TBD after provider review.' }] }] }
      ] }
    ] }
  } });
  assert.equal(report.checks.find((check) => check.id === 'acceptance').passed, false);
});

test('does not pass an unchecked plain-text acceptance item', () => {
  const report = assessIssue({ fields: {
    description: 'Acceptance criteria:\n- [ ] Buyer can download the receipt.'
  } });
  assert.equal(report.checks.find((check) => check.id === 'acceptance').passed, false);
});

test('does not pass an unfinished Jira task item under acceptance criteria', () => {
  const report = assessIssue({ fields: { description: { type: 'doc', content: [
    { type: 'heading', content: [{ type: 'text', text: 'Acceptance criteria' }] },
    { type: 'taskList', content: [
      { type: 'taskItem', attrs: { state: 'DONE' }, content: [{ type: 'text', text: 'Buyer receives a receipt after checkout.' }] },
      { type: 'taskItem', attrs: { state: 'TODO' }, content: [{ type: 'text', text: 'Buyer can reopen the receipt from order history.' }] }
    ] }
  ] } } });
  assert.equal(report.checks.find((check) => check.id === 'acceptance').passed, false);
  assert.match(report.checks.find((check) => check.id === 'acceptance').detail, /Finish Buyer can reopen the receipt/);
});

test('names the unfinished plain-text acceptance item', () => {
  const report = assessIssue({ fields: {
    description: 'Acceptance criteria:\n- [x] Buyer sees the receipt.\n- [ ] Buyer can download the receipt.'
  } });
  assert.match(report.checks.find((check) => check.id === 'acceptance').detail, /Finish Buyer can download the receipt/);
});

test('does not pass a calendar date that does not exist', () => {
  const report = assessIssue({ fields: { duedate: '2026-02-30' } }, '2026-01-01');
  assert.equal(report.checks.find((check) => check.id === 'deadline').passed, false);
});

test('does not count a scenario with an unfinished result', () => {
  const report = assessIssue({ fields: {
    description: 'Given a buyer has paid when they open orders then the receipt flow is TODO.'
  } });
  assert.equal(report.checks.find((check) => check.id === 'acceptance').passed, false);
});

test('accepts a standalone specific Given When Then scenario', () => {
  const report = assessIssue({ fields: {
    description: 'Given a buyer has paid when they open orders then they can download their receipt.'
  } });
  assert.equal(report.checks.find((check) => check.id === 'acceptance').passed, true);
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

test('does not pass a list with one specific result and one placeholder', () => {
  const report = assessIssue({ fields: {
    description: { type: 'doc', content: [
      { type: 'heading', content: [{ type: 'text', text: 'Acceptance criteria' }] },
      { type: 'bulletList', content: [
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'TBD' }] }] },
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Buyer can download a receipt after checkout.' }] }] }
      ] }
    ] }
  } });
  const acceptance = report.checks.find((check) => check.id === 'acceptance');
  assert.equal(acceptance.passed, false);
  assert.match(acceptance.detail, /Replace every placeholder/);
});

test('does not borrow a result from a later heading', () => {
  const report = assessIssue({ fields: {
    description: { type: 'doc', content: [
      { type: 'heading', content: [{ type: 'text', text: 'Acceptance criteria' }] },
      { type: 'bulletList', content: [
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'TBD' }] }] }
      ] },
      { type: 'heading', content: [{ type: 'text', text: 'Implementation notes' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'Buyer can download a receipt after checkout.' }] }
    ] }
  } });
  assert.equal(report.checks.find((check) => check.id === 'acceptance').passed, false);
});

test('names the unfinished Jira checklist item after a completed item', () => {
  const report = assessIssue({ fields: {
    description: { type: 'doc', content: [
      { type: 'heading', content: [{ type: 'text', text: 'Acceptance criteria' }] },
      { type: 'taskList', content: [
        { type: 'taskItem', attrs: { state: 'DONE' }, content: [
          { type: 'text', text: 'Buyer can review the order.' }
        ] },
        { type: 'taskItem', attrs: { state: 'TODO' }, content: [
          { type: 'text', text: 'Buyer can download a receipt.' }
        ] }
      ] }
    ] }
  } });
  const acceptance = report.checks.find((check) => check.id === 'acceptance');
  assert.equal(acceptance.passed, false);
  assert.match(acceptance.detail, /Buyer can download a receipt/);
  assert.doesNotMatch(acceptance.detail, /Buyer can review the order/);
});

test('does not demand child subtasks from a Jira subtask', () => {
  const report = assessIssue({ key: 'DEMO-10', fields: {
    issuetype: { name: 'Sub-task', subtask: true },
    status: { name: 'Done', statusCategory: { key: 'done' } },
    assignee: { accountId: 'abc' },
    duedate: '2026-12-01',
    description: 'Acceptance criteria: buyer sees a receipt',
    subtasks: []
  } }, '2026-11-07');
  assert.equal(report.total, 4);
  assert.equal(report.passed, 4);
  assert.equal(report.checks.some((check) => check.id === 'subtasks'), false);
  assert.match(report.nextAction, /All 4 checks/);
});

test('does not show full handoff evidence for an open issue', () => {
  const report = assessIssue({ key: 'DEMO-13', fields: {
    summary: 'Ship the fix', status: { name: 'In Progress', statusCategory: { key: 'indeterminate' } },
    assignee: { accountId: 'abc' }, duedate: '2026-12-01',
    description: 'Acceptance criteria: buyer sees a receipt after checkout',
    subtasks: [{ fields: { status: { statusCategory: { key: 'done' } } } }]
  } }, '2026-11-08');
  assert.equal(report.passed, 4);
  assert.equal(report.total, 5);
  assert.match(report.nextAction, /Move the issue to a done status/);
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

test('keeps resolved blocking issues visible as checked evidence', () => {
  const report = assessIssue({ key: 'DEMO-16', fields: {
    assignee: { accountId: 'abc', active: true },
    duedate: '2026-12-01',
    description: 'Acceptance criteria: Buyer can download a receipt after checkout.',
    status: { name: 'Done', statusCategory: { key: 'done' } },
    issuelinks: [{ type: { inward: 'is blocked by', outward: 'blocks' }, inwardIssue: {
      key: 'DEMO-4', fields: { status: { statusCategory: { key: 'done' } } }
    } }]
  } }, '2026-11-08');
  assert.equal(report.total, 5);
  assert.equal(report.passed, 5);
  assert.match(report.checks.find((check) => check.id === 'blockers').detail, /1 blocking issue checked/);
});
