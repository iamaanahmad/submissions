export function manualCheckIsCurrent(manual, changeVersionAtStart, currentChangeVersion) {
  return manual && changeVersionAtStart === currentChangeVersion;
}

export function handoffStatus(report, { offline = false, autoRefreshUnavailable = false, refreshPending = false, requestError = false, currentIssueId, currentIssueKey, today, now = Date.now(), monotonicNow } = {}) {
  if (!report) return { ready: false, nextAction: 'Check the Jira issue before handoff.' };
  if (currentIssueKey !== undefined && (report.contextIssueKey !== currentIssueKey
    || report.contextIssueId !== currentIssueId)) {
    return { ready: false, nextAction: 'Check this Jira issue before handoff. The visible report belongs to another issue.' };
  }
  if (offline) return { ready: false, nextAction: 'Reconnect, then check the Jira issue before handoff.' };
  if (refreshPending) return { ready: false, nextAction: 'Wait for the current Jira check before handoff.' };
  if (requestError) return { ready: false, nextAction: 'Check again before handoff. The latest Jira check failed.' };
  if (!Number.isInteger(report.total) || report.total < 1
    || !Number.isInteger(report.passed) || report.passed < 0 || report.passed > report.total
    || !Array.isArray(report.checks) || report.checks.length !== report.total
    || report.checks.some((check) => typeof check?.passed !== 'boolean')
    || !['owner', 'deadline', 'acceptance', 'status'].every((id) => report.checks.some((check) => check.id === id))
    || new Set(report.checks.map((check) => check.id)).size !== report.checks.length
    || report.checks.filter((check) => check.passed).length !== report.passed
    || typeof report.nextAction !== 'string' || !report.nextAction.trim()
    || !Number.isSafeInteger(report.checkedAtMs) || report.checkedAtMs <= 0) {
    return { ready: false, nextAction: 'Check again before handoff. The report is incomplete.' };
  }
  if (report.checkedAtMs > now) return { ready: false, nextAction: 'Check again before handoff. The device clock changed after the report.' };
  if (Number.isFinite(report.checkedAtMonotonicMs) && Number.isFinite(monotonicNow)) {
    const elapsed = monotonicNow - report.checkedAtMonotonicMs;
    if (elapsed < 0 || elapsed - (now - report.checkedAtMs) > 1000) {
      return { ready: false, nextAction: 'Check again before handoff. The device clock changed after the report.' };
    }
    if (elapsed > 5 * 60 * 1000) {
      return { ready: false, nextAction: 'Check again before handoff. The report is more than five minutes old.' };
    }
  }
  if (today && report.checkedDay !== today) return { ready: false, nextAction: 'Check again before handoff. The report was checked on a previous day.' };
  if (now - report.checkedAtMs > 5 * 60 * 1000) return { ready: false, nextAction: 'Check again before handoff. The report is more than five minutes old.' };
  if (autoRefreshUnavailable && !report.checkedManually) return { ready: false, nextAction: 'Select Check again before handoff because Jira changes may be missing.' };
  return { ready: report.passed === report.total, nextAction: report.nextAction };
}
