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

test('automatic refresh cannot replace a manual handoff check', () => {
  const gate = createRequestGate();
  const manual = gate.start({ manual: true });
  assert.equal(gate.start(), null);
  assert.equal(gate.isCurrent(manual), true);
  gate.finish(manual);
  const next = gate.start();
  assert.equal(gate.isCurrent(next), true);
});

test('issue changes clear a pending manual check', () => {
  const gate = createRequestGate();
  const manual = gate.start({ manual: true });
  gate.invalidate();
  assert.equal(gate.isCurrent(manual), false);
  const next = gate.start();
  assert.equal(gate.isCurrent(next), true);
});
