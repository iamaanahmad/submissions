import test from 'node:test';
import assert from 'node:assert/strict';
import { subscribeToIssueChanges } from '../src/issue-events.js';

test('registers Jira change events and returns the subscription', async () => {
  const subscription = { unsubscribe() {} };
  let received;
  const result = await subscribeToIssueChanges({ on: async (name, callback) => {
    assert.equal(name, 'JIRA_ISSUE_CHANGED');
    received = callback;
    return subscription;
  } }, () => {}, () => assert.fail('listener should be available'));
  assert.equal(result, subscription);
  assert.equal(typeof received, 'function');
});

test('synchronous Jira listener failure leaves manual checking available', async () => {
  let unavailable = 0;
  const result = await subscribeToIssueChanges({ on() { throw new Error('Bridge unavailable'); } },
    () => {}, () => { unavailable += 1; });
  assert.equal(result, null);
  assert.equal(unavailable, 1);
});

test('asynchronous Jira listener failure leaves manual checking available', async () => {
  let unavailable = 0;
  const result = await subscribeToIssueChanges({ on: async () => { throw new Error('Bridge unavailable'); } },
    () => {}, () => { unavailable += 1; });
  assert.equal(result, null);
  assert.equal(unavailable, 1);
});
