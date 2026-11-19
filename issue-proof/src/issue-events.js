export async function subscribeToIssueChanges(events, onChange, onUnavailable) {
  try {
    const listener = await events.on('JIRA_ISSUE_CHANGED', onChange);
    if (!listener || typeof listener.unsubscribe !== 'function') {
      onUnavailable();
      return null;
    }
    return listener;
  } catch {
    onUnavailable();
    return null;
  }
}

export function isCurrentIssueChange(event, issueId) {
  return issueId != null
    && String(event?.issueId) === String(issueId)
    && Array.isArray(event?.changes)
    && event.changes.some((change) => ['updated', 'commented'].includes(change?.changeType));
}

export function hasUnclearCurrentIssueChange(event, issueId) {
  return issueId != null
    && (event?.issueId == null || String(event.issueId) === String(issueId))
    && (event?.issueId == null || !Array.isArray(event.changes)
      || !event.changes.length
      || event.changes.some((change) => !['updated', 'commented'].includes(change?.changeType)));
}
