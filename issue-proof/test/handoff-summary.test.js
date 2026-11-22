import test from 'node:test';
import assert from 'node:assert/strict';
import { handoffSummary } from '../src/handoff-summary.js';

const report = {
  issueKey: 'TEAM-42',
  checkedAt: '11/22/2026, 2:30 PM',
  checks: [
    { label: 'Owner', detail: 'Amaan is active.' },
    { label: 'Related work', detail: 'TEAM-43 is complete.' }
  ]
};

test('a ready handoff names the issue, check time, and checked evidence', () => {
  assert.equal(handoffSummary(report, { ready: true }),
    'Issue Proof handoff for TEAM-42. Checked 11/22/2026, 2:30 PM. Owner: Amaan is active. | Related work: TEAM-43 is complete.');
});

test('stale or blocked handoffs never show a reusable summary', () => {
  assert.equal(handoffSummary(report, { ready: false }), null);
  assert.equal(handoffSummary(null, { ready: true }), null);
});
