export async function subscribeToIssueChanges(events, onChange, onUnavailable) {
  try {
    return await events.on('JIRA_ISSUE_CHANGED', onChange);
  } catch {
    onUnavailable();
    return null;
  }
}

export function isCurrentIssueUpdate(event, issueId) {
  return issueId != null
    && String(event?.issueId) === String(issueId)
    && Array.isArray(event?.changes)
    && event.changes.some((change) => change?.changeType === 'updated');
}
