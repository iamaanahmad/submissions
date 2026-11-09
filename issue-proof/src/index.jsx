import React, { useEffect, useRef, useState } from 'react';
import ForgeReconciler, { Button, Heading, Lozenge, SectionMessage, Spinner, Stack, Text, useProductContext } from '@forge/react';
import { events, requestJira } from '@forge/bridge';
import { assessIssue } from './checks.js';
import { createRequestGate } from './request-gate.js';

function App() {
  const context = useProductContext();
  const issueKey = context?.extension?.issue?.key;
  const issueId = context?.extension?.issue?.id;
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [contextTimedOut, setContextTimedOut] = useState(false);
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
      const fields = 'summary,description,assignee,duedate,subtasks,issuetype,issuelinks,status';
      const response = await requestJira(`/rest/api/3/issue/${encodeURIComponent(issueKey)}?fields=${fields}`);
      if (!response.ok) throw new Error(`Jira returned ${response.status}. Check your issue access and try again.`);
      const result = assessIssue(await response.json());
      if (requestGate.current.isCurrent(request)) setReport(result);
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
  }, [issueKey]);

  useEffect(() => {
    if (!issueKey || !issueId) return;
    let active = true;
    const subscription = events.on('JIRA_ISSUE_CHANGED', (event) => {
      if (active && String(event?.issueId) === String(issueId)
        && event.changes?.some((change) => change.changeType === 'updated')) {
        refresh();
      }
    }).catch(() => null);
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
    {report && report.issueKey === issueKey && <>
      <Heading size="medium">{report.passed} of {report.total} checks have evidence</Heading>
      <Text>{report.issueKey}: {report.summary}</Text>
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
