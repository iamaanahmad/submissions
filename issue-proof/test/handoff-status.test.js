import assert from 'node:assert/strict';
import test from 'node:test';
import { handoffStatus } from '../src/handoff-status.js';

const passedReport = { passed: 6, total: 6, nextAction: 'Hand off the issue.' };

test('a passing report is ready only while Jira checks can stay current', () => {
  assert.deepEqual(handoffStatus(passedReport), { ready: true, nextAction: 'Hand off the issue.' });
  assert.equal(handoffStatus(passedReport, { offline: true }).ready, false);
  assert.match(handoffStatus(passedReport, { offline: true }).nextAction, /Reconnect/);
  assert.equal(handoffStatus(passedReport, { autoRefreshUnavailable: true }).ready, false);
  assert.match(handoffStatus(passedReport, { autoRefreshUnavailable: true }).nextAction, /Check again/);
  assert.equal(handoffStatus({ ...passedReport, checkedManually: true }, { autoRefreshUnavailable: true }).ready, true);
  assert.equal(handoffStatus({ ...passedReport, checkedManually: true }, { autoRefreshUnavailable: true, offline: true }).ready, false);
});

test('a failing or missing report never becomes ready', () => {
  assert.equal(handoffStatus({ passed: 5, total: 6, nextAction: 'Add proof.' }).ready, false);
  assert.equal(handoffStatus(null).ready, false);
});

test('a passing report expires when the local day changes', () => {
  const report = { ...passedReport, checkedDay: '2026-11-16' };
  assert.equal(handoffStatus(report, { today: '2026-11-16' }).ready, true);
  const stale = handoffStatus(report, { today: '2026-11-17' });
  assert.equal(stale.ready, false);
  assert.match(stale.nextAction, /previous day/);
});
