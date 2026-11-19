import assert from 'node:assert/strict';
import test from 'node:test';
import { handoffStatus, manualCheckIsCurrent } from '../src/handoff-status.js';

const passedReport = {
  passed: 6, total: 6,
  checks: Array.from({ length: 6 }, (_, index) => ({ id: `check-${index}`, passed: true })),
  checkedAtMs: Date.now(), nextAction: 'Hand off the issue.'
};

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

test('a prior issue report cannot authorize handoff after Jira changes the open issue', () => {
  const report = { ...passedReport, contextIssueId: '10001', contextIssueKey: 'DEMO-1' };
  assert.equal(handoffStatus(report, { currentIssueId: '10001', currentIssueKey: 'DEMO-1' }).ready, true);
  for (const context of [
    { currentIssueId: '10002', currentIssueKey: 'DEMO-2' },
    { currentIssueId: '10001', currentIssueKey: 'DEMO-2' },
    { currentIssueId: undefined, currentIssueKey: 'DEMO-1' }
  ]) {
    const verdict = handoffStatus(report, context);
    assert.equal(verdict.ready, false);
    assert.match(verdict.nextAction, /another issue/);
  }
});

test('a visible prior report cannot authorize handoff while a newer Jira check runs or fails', () => {
  const pending = handoffStatus(passedReport, { refreshPending: true });
  assert.equal(pending.ready, false);
  assert.match(pending.nextAction, /Wait for the current Jira check/);
  const failed = handoffStatus(passedReport, { requestError: true });
  assert.equal(failed.ready, false);
  assert.match(failed.nextAction, /latest Jira check failed/);
});

test('a failing or missing report never becomes ready', () => {
  assert.equal(handoffStatus({ ...passedReport, passed: 5, checks: passedReport.checks.map((check, index) => ({ ...check, passed: index !== 0 })), nextAction: 'Add proof.' }).ready, false);
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
    { passed: 6, total: 6, nextAction: '' },
    { passed: 6, total: 6, nextAction: undefined },
  ]) {
    const verdict = handoffStatus({ ...passedReport, ...counts });
    assert.equal(verdict.ready, false);
    assert.match(verdict.nextAction, /report is incomplete/);
  }
});

test('a report cannot claim handoff when its individual checks disagree with its totals', () => {
  for (const checks of [
    undefined,
    passedReport.checks.slice(1),
    passedReport.checks.map((check, index) => index === 0 ? { ...check, passed: false } : check),
    passedReport.checks.map((check, index) => index === 0 ? { ...check, passed: 'true' } : check),
  ]) {
    const verdict = handoffStatus({ ...passedReport, checks });
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

test('a clock rollback cannot keep an old report ready when wall time still looks current', () => {
  const checkedAtMs = Date.parse('2026-11-17T04:45:00Z');
  const report = { ...passedReport, checkedAtMs, checkedAtMonotonicMs: 1000 };
  const verdict = handoffStatus(report, {
    now: checkedAtMs + 60 * 1000,
    monotonicNow: 1000 + 6 * 60 * 1000
  });
  assert.equal(verdict.ready, false);
  assert.match(verdict.nextAction, /device clock changed/);
});
