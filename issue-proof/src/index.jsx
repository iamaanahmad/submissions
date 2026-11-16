import React, { useEffect, useRef, useState } from 'react';
import ForgeReconciler, { Button, Heading, Lozenge, SectionMessage, Spinner, Stack, Text, useProductContext } from '@forge/react';
import { events, requestJira } from '@forge/bridge';
import { assessIssue, localToday } from './checks.js';
import { createRequestGate } from './request-gate.js';
import { fetchIssue } from './issue-request.js';
import { subscribeToIssueChanges } from './issue-events.js';
import { refreshWhenVisible } from './visibility-refresh.js';

function App() {
  const context = useProductContext();
  const issueKey = context?.extension?.issue?.key;
  const issueId = context?.extension?.issue?.id;
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [contextTimedOut, setContextTimedOut] = useState(false);
  const [autoRefreshUnavailable, setAutoRefreshUnavailable] = useState(false);
  const requestGate = useRef(createRequestGate());

  useEffect(() => {
    if (issueKey) {
      setContextTimedOut(false);
      return;
    }
    const timeout = setTimeout(() => setContextTimedOut(true), 5000);
    return () => clearTimeout(timeout);
  }, [issueKey]);

  async function refresh() {
    if (!issueKey) return;
    const request = requestGate.current.start();
    setLoading(true);
    setError('');
    setReport(null);
    try {
      const result = assessIssue(await fetchIssue(requestJira, issueId || issueKey));
      if (requestGate.current.isCurrent(request)) {
        setReport({ ...result, checkedAt: new Date().toLocaleString(), checkedDay: localToday(), contextIssueId: issueId, contextIssueKey: issueKey });
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
    if (!issueKey) return;
    return refreshWhenVisible(document, refresh);
  }, [issueKey, issueId]);

  useEffect(() => {
    if (!issueKey) return;
    if (!issueId) {
      setAutoRefreshUnavailable(true);
      return;
    }
    let active = true;
    setAutoRefreshUnavailable(false);
    const subscription = subscribeToIssueChanges(events, (event) => {
      if (active && String(event?.issueId) === String(issueId)
        && event.changes?.some((change) => change.changeType === 'updated')) {
        refresh();
      }
    }, () => {
      if (active) setAutoRefreshUnavailable(true);
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
    {autoRefreshUnavailable && <SectionMessage appearance="warning">
      <Text>Jira changes may not update this report automatically. Select Check again before handoff.</Text>
    </SectionMessage>}
    {report && report.contextIssueId === issueId && report.contextIssueKey === issueKey && <>
      <Heading size="medium">{report.passed} of {report.total} checks have evidence</Heading>
      <Text>{report.issueKey}: {report.summary}</Text>
      <Text>Checked at {report.checkedAt}. Select Check again before handoff if linked work changed.</Text>
      <SectionMessage appearance={report.passed === report.total ? 'success' : 'warning'}>
        <Text>Next action: {report.nextAction}</Text>
      </SectionMessage>
      {report.checks.map((check) => <Stack key={check.id} space="space.050">
        <Lozenge appearance={check.passed ? 'success' : 'moved'}>{check.passed ? 'Found' : 'Missing'}</Lozenge>
        <Text>{check.label}. {check.detail}</Text>
      </Stack>)}
      <SectionMessage appearance="information"><Text>{report.note}</Text></SectionMessage>
    </>}
    <Button appearance="primary" onClick={refresh} isDisabled={!issueKey || loading}>
      {loading ? 'Checking...' : 'Check again'}
    </Button>
  </Stack>;
}

ForgeReconciler.render(<React.StrictMode><App /></React.StrictMode>);
