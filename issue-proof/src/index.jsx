import React, { useEffect, useState } from 'react';
import ForgeReconciler, { Button, Heading, Lozenge, SectionMessage, Spinner, Stack, Text, useProductContext } from '@forge/react';
import { requestJira } from '@forge/bridge';
import { assessIssue } from './checks.js';

function App() {
  const context = useProductContext();
  const issueKey = context?.extension?.issue?.key;
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function refresh() {
    if (!issueKey) return;
    setLoading(true);
    setError('');
    try {
      const fields = 'summary,description,assignee,duedate,subtasks';
      const response = await requestJira(`/rest/api/3/issue/${encodeURIComponent(issueKey)}?fields=${fields}`);
      if (!response.ok) throw new Error(`Jira returned ${response.status}. Check your issue access and try again.`);
      setReport(assessIssue(await response.json()));
    } catch (cause) {
      setError(cause.message || 'The issue could not be checked.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, [issueKey]);

  return <Stack space="space.300">
    <Heading size="large">Issue Proof</Heading>
    <Text>Check the evidence on this Jira issue before a handoff.</Text>
    {!issueKey && <Spinner />}
    {error && <SectionMessage appearance="error"><Text>{error}</Text></SectionMessage>}
    {report && <>
      <Heading size="medium">{report.passed} of {report.total} checks have evidence</Heading>
      <Text>{report.issueKey}: {report.summary}</Text>
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
