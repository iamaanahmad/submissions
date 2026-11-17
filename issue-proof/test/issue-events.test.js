import test from 'node:test';
import assert from 'node:assert/strict';
import { hasUnclearCurrentIssueChange, isCurrentIssueUpdate, subscribeToIssueChanges } from '../src/issue-events.js';

test('ignores incomplete Jira change notices without breaking later updates', () => {
  assert.equal(isCurrentIssueUpdate(null, '1001'), false);
  assert.equal(isCurrentIssueUpdate({ issueId: '1001', changes: {} }, '1001'), false);
  assert.equal(isCurrentIssueUpdate({ issueId: '1001', changes: [null] }, '1001'), false);
  assert.equal(isCurrentIssueUpdate({ issueId: '1002', changes: [{ changeType: 'updated' }] }, '1001'), false);
  assert.equal(isCurrentIssueUpdate({ issueId: '1001', changes: [{ changeType: 'updated' }] }, '1001'), true);
});

test('flags unclear notices for the current issue without treating comments as updates', () => {
  assert.equal(hasUnclearCurrentIssueChange(null, '1001'), true);
  assert.equal(hasUnclearCurrentIssueChange({ changes: [{ changeType: 'updated' }] }, '1001'), true);
  assert.equal(hasUnclearCurrentIssueChange({ issueId: '1001', changes: {} }, '1001'), true);
  assert.equal(hasUnclearCurrentIssueChange({ issueId: '1001', changes: [] }, '1001'), true);
  assert.equal(hasUnclearCurrentIssueChange({ issueId: '1001', changes: [null] }, '1001'), true);
  assert.equal(hasUnclearCurrentIssueChange({ issueId: '1001', changes: [{ changeType: 'commented' }] }, '1001'), false);
  assert.equal(hasUnclearCurrentIssueChange({ issueId: '1001', changes: [{ changeType: 'updated' }] }, '1001'), false);
  assert.equal(hasUnclearCurrentIssueChange({ issueId: '1001', changes: [{ changeType: 'updated' }, { changeType: 'unknown' }] }, '1001'), true);
  assert.equal(hasUnclearCurrentIssueChange({ issueId: '1002', changes: [] }, '1001'), false);
});

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
