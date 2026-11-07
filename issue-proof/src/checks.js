function adfText(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(adfText).join(' ');
  return [value.text || '', adfText(value.content)].filter(Boolean).join(' ');
}

export function assessIssue(issue) {
  const fields = issue?.fields || {};
  const description = adfText(fields.description);
  const subtasks = fields.subtasks || [];
  const unfinished = subtasks.filter((item) => item.fields?.status?.statusCategory?.key !== 'done');
  const checks = [
    {
      id: 'owner',
      label: 'An owner is assigned',
      passed: Boolean(fields.assignee?.accountId),
      detail: fields.assignee?.displayName || 'Assign someone who owns the next step.'
    },
    {
      id: 'deadline',
      label: 'A target date is set',
      passed: Boolean(fields.duedate),
      detail: fields.duedate || 'Set a due date so the work can be planned.'
    },
    {
      id: 'acceptance',
      label: 'Acceptance criteria are written',
      passed: /acceptance criteria|definition of done|\bgiven\b.{0,100}\bwhen\b.{0,100}\bthen\b/i.test(description),
      detail: 'Add an Acceptance criteria section or a Given / When / Then test.'
    },
    {
      id: 'subtasks',
      label: 'Subtasks are complete',
      passed: unfinished.length === 0,
      detail: unfinished.length ? `${unfinished.length} subtask${unfinished.length === 1 ? '' : 's'} still open.` : `${subtasks.length} subtasks checked.`
    }
  ];
  const passed = checks.filter((check) => check.passed).length;
  return {
    issueKey: issue?.key || '',
    summary: fields.summary || '',
    passed,
    total: checks.length,
    checks,
    note: 'This is an evidence check, not a release approval. Review the work before shipping.'
  };
}
