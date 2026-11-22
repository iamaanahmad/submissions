export function handoffSummary(report, handoff) {
  if (!handoff?.ready || !report?.issueKey || !report?.checkedAt
    || !Array.isArray(report.checks)) return null;
  const evidence = report.checks.map((check) => `${check.label}: ${check.detail}`).join(' | ');
  return `Issue Proof handoff for ${report.issueKey}. Checked ${report.checkedAt}. ${evidence}`;
}
