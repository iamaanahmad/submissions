export async function subscribeToIssueChanges(events, onChange, onUnavailable) {
  try {
    return await events.on('JIRA_ISSUE_CHANGED', onChange);
  } catch {
    onUnavailable();
    return null;
  }
}
