import React, { useEffect, useRef, useState } from 'react';
import ForgeReconciler, { Button, Heading, Lozenge, SectionMessage, Spinner, Stack, Text, useProductContext } from '@forge/react';
import { events, requestJira } from '@forge/bridge';
import { assessIssue, localToday } from './checks.js';
import { createRequestGate } from './request-gate.js';
import { fetchIssue } from './issue-request.js';
import { hasUnclearCurrentIssueChange, isCurrentIssueUpdate, subscribeToIssueChanges } from './issue-events.js';
import { refreshWhenFocused, refreshWhenVisible } from './visibility-refresh.js';
import { refreshWhileVisible } from './periodic-refresh.js';
import { refreshWhenOnline } from './online-refresh.js';
import { handoffStatus, manualCheckIsCurrent } from './handoff-status.js';

function App() {
  const context = useProductContext();
  const issueKey = context?.extension?.issue?.key;
  const issueId = context?.extension?.issue?.id;
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [contextTimedOut, setContextTimedOut] = useState(false);
  const [autoRefreshUnavailable, setAutoRefreshUnavailable] = useState(false);
  const [offline, setOffline] = useState(false);
  const [, setNow] = useState(Date.now());
  const requestGate = useRef(createRequestGate());
  const unclearChangeVersion = useRef(0);
  const handoff = handoffStatus(report, { offline, autoRefreshUnavailable, refreshPending: loading, requestError: Boolean(error), today: localToday(), now: Date.now(), monotonicNow: performance.now() });

  useEffect(() => {
    if (!report?.checkedAtMs) return;
    // A clock change does not fire a Jira event or the report-expiry timeout.
    const interval = setInterval(() => setNow(Date.now()), 15 * 1000);
    return () => clearInterval(interval);
  }, [report?.checkedAtMs]);

  useEffect(() => {
    if (issueKey) {
      setContextTimedOut(false);
      return;
    }
    const timeout = setTimeout(() => setContextTimedOut(true), 5000);
    return () => clearTimeout(timeout);
  }, [issueKey]);

  async function refresh({ manual = false } = {}) {
    if (!issueKey) return;
    if (window.navigator.onLine === false) {
      setOffline(true);
      return;
    }
    const request = requestGate.current.start();
    const changeVersionAtStart = unclearChangeVersion.current;
    setLoading(true);
    setError('');
    try {
      const result = assessIssue(await fetchIssue(requestJira, issueId || issueKey));
      if (requestGate.current.isCurrent(request)) {
        const checkedAtMs = Date.now();
        setNow(checkedAtMs);
        setReport({ ...result, checkedAt: new Date(checkedAtMs).toLocaleString(), checkedAtMs, checkedAtMonotonicMs: performance.now(), checkedDay: localToday(), checkedManually: manualCheckIsCurrent(manual, changeVersionAtStart, unclearChangeVersion.current), contextIssueId: issueId, contextIssueKey: issueKey });
      }
    } catch (cause) {
      if (requestGate.current.isCurrent(request)) {
        setError(cause.message || 'The issue could not be checked.');
      }
    } finally {
      if (requestGate.current.isCurrent(request)) setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    return () => requestGate.current.invalidate();
  }, [issueKey, issueId]);

  useEffect(() => {
    if (!report || !issueKey) return;
    const now = new Date();
    const nextDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const timeout = setTimeout(() => {
      if (localToday() !== report.checkedDay) refresh();
    }, nextDay.getTime() - now.getTime() + 100);
    return () => clearTimeout(timeout);
  }, [report, issueKey, issueId]);

  useEffect(() => {
    if (!report?.checkedAtMs) return;
    const remaining = Math.max(0, report.checkedAtMs + 5 * 60 * 1000 - Date.now() + 1);
    const timeout = setTimeout(() => setNow(Date.now()), remaining);
    return () => clearTimeout(timeout);
  }, [report]);

  useEffect(() => {
    if (!issueKey) return;
    return refreshWhenVisible(document, refresh);
  }, [issueKey, issueId]);

  useEffect(() => {
    if (!issueKey) return;
    return refreshWhenFocused(window, document, refresh,
      () => !loading);
  }, [issueKey, issueId, loading]);

  useEffect(() => {
    if (!issueKey) return;
    // Jira does not emit an event for this panel when a linked issue changes.
    return refreshWhileVisible(document, refresh);
  }, [issueKey, issueId]);

  useEffect(() => {
    if (!issueKey) return;
    setOffline(window.navigator.onLine === false);
    return refreshWhenOnline(window, () => {
      setOffline(false);
      refresh();
    }, () => setOffline(true));
  }, [issueKey, issueId]);

  useEffect(() => {
    if (!issueKey) return;
    if (!issueId) {
      unclearChangeVersion.current += 1;
      setAutoRefreshUnavailable(true);
      setReport((current) => current ? { ...current, checkedManually: false } : current);
      return;
    }
    let active = true;
    setAutoRefreshUnavailable(false);
    const subscription = subscribeToIssueChanges(events, (event) => {
      if (active && hasUnclearCurrentIssueChange(event, issueId)) {
        unclearChangeVersion.current += 1;
        setAutoRefreshUnavailable(true);
        setReport((current) => current ? { ...current, checkedManually: false } : current);
      } else if (active && isCurrentIssueUpdate(event, issueId)) {
        refresh();
      }
    }, () => {
      if (active) {
        unclearChangeVersion.current += 1;
        setAutoRefreshUnavailable(true);
        setReport((current) => current ? { ...current, checkedManually: false } : current);
      }
    });
    return () => {
      active = false;
      subscription.then((listener) => listener?.unsubscribe());
    };
  }, [issueKey, issueId]);

  return <Stack space="space.300">
    <Heading size="large">Issue Proof</Heading>
    <Text>Check the evidence on this Jira issue before a handoff.</Text>
    {!issueKey && !contextTimedOut && <Spinner />}
    {!issueKey && contextTimedOut && <SectionMessage appearance="error">
      <Text>Jira did not provide an issue. Open a Jira issue and reopen Issue Proof.</Text>
    </SectionMessage>}
    {loading && <Spinner />}
    {error && <SectionMessage appearance="error"><Text>{error}</Text></SectionMessage>}
    {offline && <SectionMessage appearance="warning">
      <Text>You are offline. The report may be out of date. Issue Proof will check again when you reconnect.</Text>
    </SectionMessage>}
    {autoRefreshUnavailable && <SectionMessage appearance="warning">
      <Text>Jira changes may not update this report automatically. {report?.checkedManually ? 'Check again if linked work changes.' : 'Select Check again before handoff.'}</Text>
    </SectionMessage>}
    {report && report.contextIssueId === issueId && report.contextIssueKey === issueKey && <>
      <Heading size="medium">{report.passed} of {report.total} checks have evidence</Heading>
      <Text>{report.issueKey}: {report.summary}</Text>
      <Text>Checked at {report.checkedAt}. Select Check again before handoff if linked work changed.</Text>
      <SectionMessage appearance={handoff.ready ? 'success' : 'warning'}>
        <Text>Next action: {handoff.nextAction}</Text>
      </SectionMessage>
      {report.checks.map((check) => <Stack key={check.id} space="space.050">
        <Lozenge appearance={check.passed ? 'success' : 'moved'}>{check.passed ? 'Found' : 'Missing'}</Lozenge>
        <Text>{check.label}. {check.detail}</Text>
      </Stack>)}
      <SectionMessage appearance="information"><Text>{report.note}</Text></SectionMessage>
    </>}
    <Button appearance="primary" onClick={() => refresh({ manual: true })} isDisabled={!issueKey || loading}>
      {loading ? 'Checking...' : 'Check again'}
    </Button>
  </Stack>;
}

ForgeReconciler.render(<React.StrictMode><App /></React.StrictMode>);
