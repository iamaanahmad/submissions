import test from 'node:test';
import assert from 'node:assert/strict';
import { refreshWhileVisible } from '../src/periodic-refresh.js';

test('checks linked work while visible without polling a hidden Jira tab', () => {
  const doc = { visibilityState: 'hidden' };
  let tick;
  let intervalMs;
  let cancelled;
  let checks = 0;
  const stop = refreshWhileVisible(doc, () => { checks += 1; },
    (callback, delay) => { tick = callback; intervalMs = delay; return 17; },
    (id) => { cancelled = id; });
  assert.equal(intervalMs, 300000);
  tick();
  assert.equal(checks, 0);
  doc.visibilityState = 'visible';
  tick();
  assert.equal(checks, 1);
  stop();
  assert.equal(cancelled, 17);
});
