export function handoffStatus(report, { offline = false, autoRefreshUnavailable = false, today } = {}) {
  if (!report) return { ready: false, nextAction: 'Check the Jira issue before handoff.' };
  if (offline) return { ready: false, nextAction: 'Reconnect, then check the Jira issue before handoff.' };
  if (today && report.checkedDay !== today) return { ready: false, nextAction: 'Check again before handoff. The report was checked on a previous day.' };
  if (autoRefreshUnavailable && !report.checkedManually) return { ready: false, nextAction: 'Select Check again before handoff because Jira changes may be missing.' };
  return { ready: report.passed === report.total, nextAction: report.nextAction };
}
