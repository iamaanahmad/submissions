import test from 'node:test';
import assert from 'node:assert/strict';
import { refreshWhenVisible } from '../src/visibility-refresh.js';

test('checks Jira again when a hidden tab returns, then removes the listener', () => {
  const listeners = new Map();
  const doc = {
    visibilityState: 'hidden',
    addEventListener(name, listener) { listeners.set(name, listener); },
    removeEventListener(name, listener) {
      if (listeners.get(name) === listener) listeners.delete(name);
    }
  };
  let checks = 0;
  const stop = refreshWhenVisible(doc, () => { checks += 1; });
  listeners.get('visibilitychange')();
  assert.equal(checks, 0);
  doc.visibilityState = 'visible';
  listeners.get('visibilitychange')();
  assert.equal(checks, 1);
  stop();
  assert.equal(listeners.has('visibilitychange'), false);
});
