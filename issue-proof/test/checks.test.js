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

test('recognizes custom Jira dependency links in the correct direction', () => {
  const report = assessIssue({ key: 'DEMO-50', fields: {
    issuelinks: [
      { type: { outward: 'requires', inward: 'is required by' }, outwardIssue: {
        key: 'DEMO-51', fields: { status: { statusCategory: { key: 'indeterminate' } } }
      } },
      { type: { outward: 'requires', inward: 'is required by' }, inwardIssue: {
        key: 'DEMO-52', fields: { status: { statusCategory: { key: 'indeterminate' } } }
      } }
    ]
  } });
  const blockers = report.checks.find((check) => check.id === 'blockers');
  assert.equal(blockers.passed, false);
  assert.match(blockers.detail, /DEMO-51/);
  assert.doesNotMatch(blockers.detail, /DEMO-52/);
});

test('blocks handoff for open Jira checklist items outside acceptance criteria', () => {
  const report = assessIssue({ key: 'DEMO-30', fields: {
    assignee: { accountId: 'abc', active: true },
    duedate: '2026-12-01',
    status: { name: 'Done', statusCategory: { key: 'done' } },
    description: { type: 'doc', content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'Acceptance criteria: Buyer receives a receipt after checkout.' }] },
      { type: 'heading', content: [{ type: 'text', text: 'Implementation notes' }] },
      { type: 'taskList', content: [
        { type: 'taskItem', attrs: { state: 'DONE' }, content: [{ type: 'text', text: 'Review copy' }] },
        { type: 'taskItem', attrs: { state: 'TODO' }, content: [{ type: 'text', text: 'Verify refund path' }] }
      ] }
    ] }
  } }, '2026-11-09');
  const checklist = report.checks.find((check) => check.id === 'checklist');
  assert.equal(checklist.passed, false);
  assert.match(checklist.detail, /Verify refund path/);
  assert.doesNotMatch(checklist.detail, /Review copy/);
  assert.equal(report.passed, 4);
  assert.equal(report.total, 5);
});

test('blocks an unchecked pasted checklist outside acceptance criteria', () => {
  const report = assessIssue({ key: 'DEMO-31', fields: {
    assignee: { accountId: 'abc' }, duedate: '2026-12-01',
    status: { name: 'Done', statusCategory: { key: 'done' } },
    description: { type: 'doc', content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'Acceptance criteria: Buyer sees the receipt after checkout.' }] },
      { type: 'heading', content: [{ type: 'text', text: 'Handoff checklist' }] },
      { type: 'paragraph', content: [{ type: 'text', text: '- [x] Review the copy' }] },
      { type: 'paragraph', content: [{ type: 'text', text: '- [ ] Verify the refund path' }] }
    ] }
  } }, '2026-11-09');
  const checklist = report.checks.find((check) => check.id === 'checklist');
  assert.equal(checklist.passed, false);
  assert.match(checklist.detail, /Verify the refund path/);
  assert.doesNotMatch(checklist.detail, /Review the copy/);
});

test('ignores unchecked examples in code while checking real Jira tasks', () => {
  const report = assessIssue({ key: 'DEMO-32', fields: {
    assignee: { accountId: 'abc' }, duedate: '2026-12-01',
    status: { name: 'Done', statusCategory: { key: 'done' } },
    description: { type: 'doc', content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'Acceptance criteria: Buyer sees the receipt after checkout.' }] },
      { type: 'codeBlock', content: [{ type: 'text', text: '- [ ] Example only' }] },
      { type: 'taskList', content: [
        { type: 'taskItem', attrs: { state: 'TODO' }, content: [{ type: 'text', text: 'Verify the actual receipt' }] }
      ] }
    ] }
  } }, '2026-11-09');
  const checklist = report.checks.find((check) => check.id === 'checklist');
  assert.equal(checklist.passed, false);
  assert.match(checklist.detail, /Verify the actual receipt/);
  assert.doesNotMatch(checklist.detail, /Example only/);
});

test('does not block handoff for unchecked examples inside code blocks', () => {
  const report = assessIssue({ key: 'DEMO-33', fields: {
    assignee: { accountId: 'abc' }, duedate: '2026-12-01',
    status: { name: 'Done', statusCategory: { key: 'done' } },
    description: { type: 'doc', content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'Acceptance criteria: Buyer sees the receipt after checkout.' }] },
      { type: 'codeBlock', content: [{ type: 'text', text: '- [ ] Example only' }] }
    ] }
  } }, '2026-11-09');
  assert.equal(report.checks.some((check) => check.id === 'checklist'), false);
  assert.equal(report.passed, report.total);
});

test('ignores inline code examples while keeping real acceptance and checklist work', () => {
  const report = assessIssue({ fields: {
    assignee: { accountId: 'abc' }, duedate: '2026-12-01',
    status: { name: 'Done', statusCategory: { key: 'done' } },
    description: { type: 'doc', content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'Acceptance criteria: Example only passes.', marks: [{ type: 'code' }] }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'Acceptance criteria: Buyer receives the receipt after checkout.' }] },
      { type: 'paragraph', content: [{ type: 'text', text: '- [ ] Example only', marks: [{ type: 'code' }] }] },
      { type: 'paragraph', content: [{ type: 'text', text: '- [ ] Verify the actual receipt' }] }
    ] }
  } }, '2026-11-09');
  const checklist = report.checks.find((check) => check.id === 'checklist');
  assert.match(checklist.detail, /Verify the actual receipt/);
  assert.doesNotMatch(checklist.detail, /Example only/);
  assert.equal(report.checks.find((check) => check.id === 'acceptance').passed, false);
});

test('ignores pasted Markdown code fences but keeps real checklist work', () => {
  const report = assessIssue({ key: 'DEMO-34', fields: {
    description: '```md\nAcceptance criteria: Example only passes.\n- [ ] Example only\n```\nAcceptance criteria: Buyer receives the receipt after checkout.\n- [ ] Verify the actual receipt',
    assignee: { accountId: 'abc' }, duedate: '2026-12-01',
    status: { name: 'Done', statusCategory: { key: 'done' } }
  } }, '2026-11-09');
  const checklist = report.checks.find((check) => check.id === 'checklist');
  assert.equal(checklist.passed, false);
  assert.match(checklist.detail, /Verify the actual receipt/);
  assert.doesNotMatch(checklist.detail, /Example only/);
  assert.equal(report.checks.find((check) => check.id === 'acceptance').passed, false);
});

test('ignores a pasted fence spread across Jira paragraphs', () => {
  const paragraph = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
  const report = assessIssue({ fields: {
    description: { type: 'doc', content: [
      paragraph('```md'),
      paragraph('Acceptance criteria: Example only passes.'),
      paragraph('```'),
      paragraph('Acceptance criteria: Buyer receives the receipt after checkout.')
    ] }
  } });
  const acceptance = report.checks.find((check) => check.id === 'acceptance');
  assert.equal(acceptance.passed, true);
  assert.match(acceptance.detail, /1 written result/);
});

test('accepts an inactive Jira assignee as the recorded owner', () => {
  const report = assessIssue({ key: 'DEMO-14', fields: {
    assignee: { accountId: 'former-user', displayName: 'Former owner', active: false },
    duedate: '2026-12-01',
    description: 'Acceptance criteria: buyer receives a receipt after checkout',
    status: { name: 'Done', statusCategory: { key: 'done' } },
    subtasks: [{ fields: { status: { statusCategory: { key: 'done' } } } }]
  } }, '2026-11-08');
  assert.equal(report.passed, 5);
  assert.match(report.nextAction, /Review the actual work/);
  assert.match(report.checks.find((check) => check.id === 'owner').detail, /inactive account/);
});

test('an inactive account without an assignee ID does not count as an owner', () => {
  const report = assessIssue({ fields: {
    assignee: { displayName: 'Former owner', active: false }
  } });
  assert.equal(report.checks.find((check) => check.id === 'owner').passed, false);
  assert.match(report.nextAction, /Assign someone/);
});

test('names the first vague result when every acceptance item is vague', () => {
  const report = assessIssue({ key: 'DEMO-40', fields: {
    description: 'Acceptance criteria:\n- TBD\n- Pending review',
    status: { name: 'Done', statusCategory: { key: 'done' } }
  } });
  const acceptance = report.checks.find((check) => check.id === 'acceptance');
  assert.equal(acceptance.passed, false);
  assert.match(acceptance.detail, /Start with: TBD/);
});

test('does not accept a generic completion claim as a testable result', () => {
  const report = assessIssue({ fields: {
    description: 'Acceptance criteria:\n- Buyer receives a receipt after checkout.\n- Works as expected',
    status: { name: 'Done', statusCategory: { key: 'done' } }
  } });
  const acceptance = report.checks.find((check) => check.id === 'acceptance');
  assert.equal(acceptance.passed, false);
  assert.match(acceptance.detail, /Start with: Works as expected/);
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

test('does not count a Jira code example as acceptance evidence', () => {
  const codeBlock = { type: 'codeBlock', content: [{ type: 'text', text: 'Given a buyer has paid when they open history then a receipt appears.' }] };
  const underHeading = assessIssue({ fields: { description: { type: 'doc', content: [
    { type: 'heading', content: [{ type: 'text', text: 'Acceptance criteria' }] }, codeBlock
  ] } } });
  const standalone = assessIssue({ fields: { description: { type: 'doc', content: [codeBlock] } } });
  const headingInCode = assessIssue({ fields: { description: { type: 'doc', content: [
    { type: 'codeBlock', content: [{ type: 'text', text: 'Acceptance criteria: Buyer receives a receipt after checkout.' }] }
  ] } } });
  assert.equal(underHeading.checks.find((check) => check.id === 'acceptance').passed, false);
  assert.equal(standalone.checks.find((check) => check.id === 'acceptance').passed, false);
  assert.equal(headingInCode.checks.find((check) => check.id === 'acceptance').passed, false);
});

test('reads acceptance criteria under a pasted Markdown heading', () => {
  const report = assessIssue({ fields: {
    description: '## Acceptance criteria\n- Buyer receives a receipt after checkout.\n- Buyer can download it from order history.'
  } });
  const acceptance = report.checks.find((check) => check.id === 'acceptance');
  assert.equal(acceptance.passed, true);
  assert.match(acceptance.detail, /2 written results/);
});

test('reads concrete results under success criteria and done when headings', () => {
  for (const heading of ['Success criteria', 'Done when']) {
    const report = assessIssue({ fields: {
      description: `## ${heading}\n- Buyer receives a receipt after checkout.`
    } });
    assert.equal(report.checks.find((check) => check.id === 'acceptance').passed, true, heading);
  }
});

test('does not accept an empty done when heading', () => {
  const report = assessIssue({ fields: { description: 'Done when:\nImplementation notes: add a receipt.' } });
  assert.equal(report.checks.find((check) => check.id === 'acceptance').passed, false);
});

test('stops pasted Markdown criteria at the next heading', () => {
  const report = assessIssue({ fields: {
    description: '## Acceptance criteria\n- Buyer receives a receipt after checkout.\n## Implementation\n- TODO: add receipt storage.'
  } });
  assert.equal(report.checks.find((check) => check.id === 'acceptance').passed, true);
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

test('accepts a specific Given When Then scenario on separate Jira paragraphs', () => {
  const report = assessIssue({ fields: { description: { type: 'doc', content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'Given a buyer has paid for an order' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'When they open their order history' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'Then they can download the receipt' }] }
  ] } } });
  assert.equal(report.checks.find((check) => check.id === 'acceptance').passed, true);
});

test('rejects an unfinished multi-line scenario', () => {
  const report = assessIssue({ fields: { description: [
    'Given a buyer has paid for an order',
    'When they open their order history',
    'Then the receipt flow is TBD'
  ].join('\n') } });
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

test('does not count pending decisions as completed acceptance evidence', () => {
  for (const unfinished of ['TBC', 'WIP', 'to be confirmed', 'pending review', '???']) {
    const report = assessIssue({ fields: {
      description: `Acceptance criteria:\n- Buyer receives a receipt after checkout.\n- Refund behavior is ${unfinished}`
    } });
    assert.equal(report.checks.find((check) => check.id === 'acceptance').passed, false, unfinished);
  }
});

test('does not pass an unchecked plain-text acceptance item', () => {
  const report = assessIssue({ fields: {
    description: 'Acceptance criteria:\n- [ ] Buyer can download the receipt.'
  } });
  assert.equal(report.checks.find((check) => check.id === 'acceptance').passed, false);
});

test('does not hide an unchecked Jira line break inside a checked result', () => {
  const report = assessIssue({ fields: { description: { type: 'doc', content: [
    { type: 'paragraph', content: [
      { type: 'text', text: 'Acceptance criteria: Buyer receives a receipt after checkout.' },
      { type: 'hardBreak' },
      { type: 'text', text: '- [ ] Buyer can download the receipt from order history.' }
    ] }
  ] } } });
  const acceptance = report.checks.find((check) => check.id === 'acceptance');
  assert.equal(acceptance.passed, false);
  assert.match(acceptance.detail, /Finish Buyer can download the receipt/);
});

test('counts two complete Jira results separated by a line break', () => {
  const report = assessIssue({ fields: { description: { type: 'doc', content: [
    { type: 'paragraph', content: [
      { type: 'text', text: 'Acceptance criteria:' },
      { type: 'hardBreak' },
      { type: 'text', text: 'Buyer receives a receipt after checkout.' },
      { type: 'hardBreak' },
      { type: 'text', text: 'Buyer can download it from order history.' }
    ] }
  ] } } });
  const acceptance = report.checks.find((check) => check.id === 'acceptance');
  assert.equal(acceptance.passed, true);
  assert.match(acceptance.detail, /2 written results/);
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

test('does not count an implementation example as acceptance evidence', () => {
  for (const description of [
    'Implementation notes: Given a mock buyer when a stub runs then a fake receipt appears.',
    '## Implementation notes\nGiven a mock buyer when a stub runs then a fake receipt appears.'
  ]) {
    const report = assessIssue({ fields: { description } });
    assert.equal(report.checks.find((check) => check.id === 'acceptance').passed, false);
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

test('does not borrow implementation steps as acceptance evidence', () => {
  const report = assessIssue({ fields: {
    description: 'Acceptance criteria:\nImplementation: Add a download button to the order page.'
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

test('keeps styled Jira text together inside an acceptance heading and result', () => {
  const report = assessIssue({ fields: {
    description: { type: 'doc', content: [
      { type: 'paragraph', content: [
        { type: 'text', text: 'Accept', marks: [{ type: 'strong' }] },
        { type: 'text', text: 'ance criteria: Buyer can down' },
        { type: 'text', text: 'load a receipt after checkout.', marks: [{ type: 'em' }] }
      ] }
    ] }
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

test('keeps a labeled result inside acceptance criteria', () => {
  const report = assessIssue({ fields: {
    description: { type: 'doc', content: [
      { type: 'heading', content: [{ type: 'text', text: 'Acceptance criteria' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'API response: buyer can download a receipt after checkout.' }] }
    ] }
  } });
  assert.equal(report.checks.find((check) => check.id === 'acceptance').passed, true);
});

test('stops acceptance results at a later notes section', () => {
  const report = assessIssue({ fields: {
    description: 'Acceptance criteria:\nImplementation notes: buyer can download a receipt after checkout.'
  } });
  assert.equal(report.checks.find((check) => check.id === 'acceptance').passed, false);
});

test('does not use an unpunctuated notes heading as acceptance evidence', () => {
  const report = assessIssue({ fields: {
    description: 'Acceptance criteria:\nRelease notes\nBuyer can download a receipt after checkout.'
  } });
  assert.equal(report.checks.find((check) => check.id === 'acceptance').passed, false);
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
  assert.match(acceptance.detail, /Start with: TBD/);
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

test('does not count a pasted unchecked acceptance result as complete evidence', () => {
  const report = assessIssue({ fields: {
    description: 'Acceptance criteria:\n- [ ] Buyer can download a receipt after checkout.'
  } });
  const acceptance = report.checks.find((check) => check.id === 'acceptance');
  assert.equal(acceptance.passed, false);
  assert.match(acceptance.detail, /Buyer can download a receipt/);
  assert.equal(report.checks.find((check) => check.id === 'checklist').passed, false);
});

test('blocks numbered unchecked checklist items in acceptance and handoff notes', () => {
  const report = assessIssue({ fields: {
    description: 'Acceptance criteria:\n1. [x] Buyer can review the order.\n2) [ ] Buyer can download a receipt.\nImplementation notes:\n3. [ ] Verify the refund path.'
  } });
  const acceptance = report.checks.find((check) => check.id === 'acceptance');
  const checklist = report.checks.find((check) => check.id === 'checklist');
  assert.equal(acceptance.passed, false);
  assert.match(acceptance.detail, /Buyer can download a receipt/);
  assert.equal(checklist.passed, false);
  assert.match(checklist.detail, /Buyer can download a receipt/);
  assert.match(checklist.detail, /1 more checklist item/);
});

test('blocks pasted empty-square checklist items in Jira descriptions', () => {
  const report = assessIssue({ fields: {
    description: 'Acceptance criteria:\n☑ Buyer can review the order.\n☐ Buyer can download a receipt.\nImplementation notes:\n□ Verify the refund path.'
  } });
  const acceptance = report.checks.find((check) => check.id === 'acceptance');
  const checklist = report.checks.find((check) => check.id === 'checklist');
  assert.equal(acceptance.passed, false);
  assert.match(acceptance.detail, /Buyer can download a receipt/);
  assert.match(checklist.detail, /Buyer can download a receipt/);
  assert.match(checklist.detail, /1 more checklist item/);
  assert.doesNotMatch(checklist.detail, /Buyer can review the order/);
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

test('keeps a completed issue’s original target date as evidence', () => {
  const issue = { fields: {
    duedate: '2026-11-01',
    status: { name: 'Done', statusCategory: { key: 'done' } }
  } };
  const completed = assessIssue(issue, '2026-11-09');
  assert.equal(completed.checks.find((check) => check.id === 'deadline').passed, true);
  assert.match(completed.checks.find((check) => check.id === 'deadline').detail, /2026-11-01 was the target date/);

  issue.fields.status = { name: 'In Progress', statusCategory: { key: 'indeterminate' } };
  const open = assessIssue(issue, '2026-11-09');
  assert.equal(open.checks.find((check) => check.id === 'deadline').passed, false);
  assert.match(open.checks.find((check) => check.id === 'deadline').detail, /due date has passed/);
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

test('treats an unresolved depends-on link as a handoff blocker', () => {
  const report = assessIssue({ key: 'DEMO-20', fields: {
    issuelinks: [
      { type: { inward: 'is depended on by', outward: 'depends on' }, outwardIssue: {
        key: 'DEMO-21', fields: { status: { statusCategory: { key: 'indeterminate' } } }
      } },
      { type: { inward: 'is depended on by', outward: 'depends on' }, inwardIssue: {
        key: 'DEMO-22', fields: { status: { statusCategory: { key: 'indeterminate' } } }
      } }
    ]
  } });
  const blocker = report.checks.find((check) => check.id === 'blockers');
  assert.equal(blocker.passed, false);
  assert.match(blocker.detail, /DEMO-21/);
  assert.doesNotMatch(blocker.detail, /DEMO-22/);
});

test('recognizes custom Jira blocked-by and depends-upon labels without reversing links', () => {
  const report = assessIssue({ key: 'DEMO-25', fields: {
    issuelinks: [
      { type: { inward: 'blocked by', outward: 'blocks' }, inwardIssue: {
        key: 'DEMO-26', fields: { status: { statusCategory: { key: 'indeterminate' } } }
      } },
      { type: { inward: 'is depended upon by', outward: 'depends upon' }, outwardIssue: {
        key: 'DEMO-27', fields: { status: { statusCategory: { key: 'indeterminate' } } }
      } },
      { type: { inward: 'blocked by', outward: 'blocks' }, outwardIssue: {
        key: 'DEMO-28', fields: { status: { statusCategory: { key: 'indeterminate' } } }
      } }
    ]
  } });
  const blocker = report.checks.find((check) => check.id === 'blockers');
  assert.equal(blocker.passed, false);
  assert.match(blocker.detail, /DEMO-26/);
  assert.match(blocker.detail, /DEMO-27/);
  assert.doesNotMatch(blocker.detail, /DEMO-28/);
});

test('reads acceptance results after a dash separator', () => {
  const report = assessIssue({ key: 'DEMO-23', fields: {
    assignee: { accountId: 'abc' },
    duedate: '2026-12-01',
    description: 'Acceptance criteria - Buyer can download a receipt after checkout.',
    status: { name: 'Done', statusCategory: { key: 'done' } }
  } }, '2026-11-09');
  assert.equal(report.checks.find((check) => check.id === 'acceptance').passed, true);
  assert.equal(report.passed, report.total);
});
