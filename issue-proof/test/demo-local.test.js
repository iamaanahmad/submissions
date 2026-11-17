import assert from 'node:assert/strict';
import test from 'node:test';
import { demoReports } from '../scripts/demo-local.js';

test('local walkthrough shows a completed issue and an unfinished handoff', () => {
  const [ready, blocked] = demoReports();
  assert.equal(ready.ready, true);
  assert.equal(ready.passed, ready.total);
  assert.equal(blocked.ready, false);
  assert.ok(blocked.passed < blocked.total);
  assert.match(blocked.nextAction, /demo was not uploaded/i);
});
