import assert from 'node:assert/strict';
import test from 'node:test';
import { handoffStatus, manualCheckIsCurrent } from '../src/handoff-status.js';

const passedReport = { passed: 6, total: 6, checkedAtMs: Date.now(), nextAction: 'Hand off the issue.' };

test('a manual check cannot clear an unclear notice that arrived while Jira replied', () => {
  assert.equal(manualCheckIsCurrent(true, 3, 3), true);
  assert.equal(manualCheckIsCurrent(true, 3, 4), false);
  assert.equal(manualCheckIsCurrent(false, 3, 3), false);
  const report = { ...passedReport, checkedManually: manualCheckIsCurrent(true, 3, 4) };
  assert.equal(handoffStatus(report, { autoRefreshUnavailable: true }).ready, false);
});

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

test('an empty or inconsistent report cannot authorize handoff', () => {
  for (const counts of [
    { passed: 0, total: 0 },
    { passed: 7, total: 6 },
    { passed: -1, total: 6 },
    { passed: 6, total: undefined },
    { passed: 6, total: 6, checkedAtMs: undefined },
    { passed: 6, total: 6, checkedAtMs: NaN },
    { passed: 6, total: 6, checkedAtMs: 0 },
  ]) {
    const verdict = handoffStatus({ ...counts, nextAction: 'Hand off the issue.' });
    assert.equal(verdict.ready, false);
    assert.match(verdict.nextAction, /report is incomplete/);
  }
});

test('a passing report expires when the local day changes', () => {
  const report = { ...passedReport, checkedDay: '2026-11-16' };
  assert.equal(handoffStatus(report, { today: '2026-11-16' }).ready, true);
  const stale = handoffStatus(report, { today: '2026-11-17' });
  assert.equal(stale.ready, false);
  assert.match(stale.nextAction, /previous day/);
});

test('a passing report expires after five minutes without a Jira refresh', () => {
  const checkedAtMs = Date.parse('2026-11-17T04:45:00Z');
  const report = { ...passedReport, checkedAtMs, checkedDay: '2026-11-17' };
  assert.equal(handoffStatus(report, { now: checkedAtMs + 5 * 60 * 1000 }).ready, true);
  const stale = handoffStatus(report, { now: checkedAtMs + 5 * 60 * 1000 + 1 });
  assert.equal(stale.ready, false);
  assert.match(stale.nextAction, /more than five minutes old/);
});

test('a report checked in the future cannot stay ready after a clock change', () => {
  const checkedAtMs = Date.parse('2026-11-17T04:45:00Z');
  const report = { ...passedReport, checkedAtMs, checkedDay: '2026-11-17' };
  const verdict = handoffStatus(report, { now: checkedAtMs - 60 * 1000, today: '2026-11-17' });
  assert.equal(verdict.ready, false);
  assert.match(verdict.nextAction, /device clock changed/);
});
