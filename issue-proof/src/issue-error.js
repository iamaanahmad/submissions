export function issueFetchError(status) {
  if (status === 403) return 'Jira denied access to this issue. Ask a project admin for issue access, then check again.';
  if (status === 404) return 'Jira could not find this issue. It may have moved or you may not have access.';
  if (status === 429) return 'Jira is limiting requests. Wait a moment, then check again.';
  return `Jira returned ${status}. Check your issue access and try again.`;
}
