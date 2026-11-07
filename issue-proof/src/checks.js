function adfText(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(adfText).join(' ');
  return [value.text || '', adfText(value.content)].filter(Boolean).join(' ');
}

export function assessIssue(issue, today = new Date().toISOString().slice(0, 10)) {
  const fields = issue?.fields || {};
  const description = adfText(fields.description);
  const subtasks = fields.subtasks || [];
  const unfinished = subtasks.filter((item) => item.fields?.status?.statusCategory?.key !== 'done');
  const dueDate = typeof fields.duedate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(fields.duedate)
    ? fields.duedate : '';
  const overdue = Boolean(dueDate && dueDate < today);
  const acceptanceSection = description.match(/(?:acceptance criteria|definition of done)\s*:\s*(.+)/i);
  const hasAcceptance = Boolean(
    (acceptanceSection && acceptanceSection[1].trim().length >= 12)
    || /\bgiven\b.{1,100}\bwhen\b.{1,100}\bthen\b.{1,100}\S/i.test(description)
  );
  const checks = [
    {
      id: 'owner',
      label: 'An owner is assigned',
      passed: Boolean(fields.assignee?.accountId),
      detail: fields.assignee?.displayName || 'Assign someone who owns the next step.'
    },
    {
      id: 'deadline',
      label: 'A current target date is set',
      passed: Boolean(dueDate && !overdue),
      detail: overdue ? `The ${dueDate} due date has passed. Set a current target date.`
        : dueDate || 'Set a due date so the work can be planned.'
    },
    {
      id: 'acceptance',
      label: 'Acceptance criteria are written',
      passed: hasAcceptance,
      detail: hasAcceptance ? 'A written result to check is present.'
        : 'Write a specific result under Acceptance criteria or Given / When / Then.'
    },
    {
      id: 'subtasks',
      label: 'Subtasks are complete',
      passed: subtasks.length > 0 && unfinished.length === 0,
      detail: !subtasks.length ? 'Add subtasks so completion can be checked.'
        : unfinished.length ? `${unfinished.length} subtask${unfinished.length === 1 ? '' : 's'} still open.`
          : `${subtasks.length} subtasks checked.`
    }
  ];
  const passed = checks.filter((check) => check.passed).length;
  const nextAction = checks.find((check) => !check.passed);
  return {
    issueKey: issue?.key || '',
    summary: fields.summary || '',
    passed,
    total: checks.length,
    checks,
    nextAction: nextAction
      ? `${nextAction.label}: ${nextAction.detail}`
      : 'All four checks have evidence. Review the actual work before handoff.',
    note: 'This is an evidence check, not a release approval. Review the work before shipping.'
  };
}
