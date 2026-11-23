import assert from 'node:assert/strict';
import test from 'node:test';
import { demoReports } from '../scripts/demo-local.js';

test('local walkthrough checks completed, unfinished, and reopened linked Jira work', async () => {
  const [ready, blocked, reopenedLink] = await demoReports();
  assert.equal(ready.ready, true);
  assert.equal(ready.passed, ready.total);
  assert.equal(blocked.ready, false);
  assert.ok(blocked.passed < blocked.total);
  assert.match(blocked.nextAction, /demo was not uploaded/i);
  assert.equal(reopenedLink.ready, false);
  assert.ok(reopenedLink.passed < reopenedLink.total);
  assert.match(reopenedLink.nextAction, /DEMO-4/);
});
