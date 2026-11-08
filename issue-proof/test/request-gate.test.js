import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequestGate } from '../src/request-gate.js';

test('only the newest Jira request may update the panel', () => {
  const gate = createRequestGate();
  const oldIssue = gate.start();
  const newIssue = gate.start();
  assert.equal(gate.isCurrent(oldIssue), false);
  assert.equal(gate.isCurrent(newIssue), true);
  gate.invalidate();
  assert.equal(gate.isCurrent(newIssue), false);
});
