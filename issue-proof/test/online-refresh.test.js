import test from 'node:test';
import assert from 'node:assert/strict';
import { refreshWhenOnline } from '../src/online-refresh.js';

test('retries after connection returns and removes the listener', () => {
  const listeners = new Map();
  const browser = {
    addEventListener(name, callback) { listeners.set(name, callback); },
    removeEventListener(name, callback) {
      if (listeners.get(name) === callback) listeners.delete(name);
    }
  };
  let attempts = 0;
  let warnings = 0;
  const stop = refreshWhenOnline(browser, () => { attempts += 1; }, () => { warnings += 1; });
  listeners.get('offline')();
  assert.equal(warnings, 1);
  assert.equal(attempts, 0);
  listeners.get('online')();
  assert.equal(attempts, 1);
  stop();
  assert.equal(listeners.has('online'), false);
  assert.equal(listeners.has('offline'), false);
});
