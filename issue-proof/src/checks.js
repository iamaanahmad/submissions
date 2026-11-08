function adfText(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(adfText).filter(Boolean).join('\n');
  const content = Array.isArray(value.content)
    ? value.content.map(adfText).filter(Boolean).join(value.type === 'paragraph' ? ' ' : '\n')
    : '';
  return [value.text || '', content].filter(Boolean).join(' ');
}

export function assessIssue(issue, today = new Date().toISOString().slice(0, 10)) {
  const fields = issue?.fields || {};
  const description = adfText(fields.description);
  const descriptionBlocks = Array.isArray(fields.description?.content)
    ? fields.description.content.map((block) => ({
      text: adfText(block).trim(),
      heading: block.type === 'heading'
    })).filter((block) => block.text)
    : description.split('\n').map((text) => ({ text: text.trim(), heading: false })).filter((block) => block.text);
  const subtasks = fields.subtasks || [];
  const unfinished = subtasks.filter((item) => item.fields?.status?.statusCategory?.key !== 'done');
  const unfinishedNames = unfinished.map((item) => item.key || item.fields?.summary || 'Unnamed subtask');
  const blockers = (fields.issuelinks || []).flatMap((link) => {
    const isInwardBlocker = link.type?.inward?.toLowerCase() === 'is blocked by';
    const isOutwardBlocker = link.type?.outward?.toLowerCase() === 'is blocked by';
    const linkedIssue = isInwardBlocker ? link.inwardIssue
      : isOutwardBlocker ? link.outwardIssue : null;
    return linkedIssue && linkedIssue.fields?.status?.statusCategory?.key !== 'done'
      ? [linkedIssue.key || 'Linked issue'] : [];
  });
  const dueDate = typeof fields.duedate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(fields.duedate)
    ? fields.duedate : '';
  const overdue = Boolean(dueDate && dueDate < today);
  const acceptanceIndex = descriptionBlocks.findIndex((block) => /^(?:acceptance criteria|definition of done)[ \t]*(?::|$)/i.test(block.text));
  const inlineAcceptance = acceptanceIndex >= 0
    ? descriptionBlocks[acceptanceIndex].text.replace(/^(?:acceptance criteria|definition of done)[ \t]*:?[ \t]*/i, '') : '';
  const followingAcceptance = acceptanceIndex >= 0
    ? (descriptionBlocks[acceptanceIndex + 1]?.heading ? ''
      : (descriptionBlocks[acceptanceIndex + 1]?.text || '').replace(/^[-*\u2022]\s*/, '')) : '';
  const acceptanceEvidence = inlineAcceptance || (
    /^[a-z][^:]{2,40}:/i.test(followingAcceptance) ? '' : followingAcceptance
  );
  const isPlaceholder = /^(?:tbd|todo|none|n\/a|not applicable|to be (?:determined|defined|added)|coming soon|pending|see (?:later|ticket))\.?$/i.test(acceptanceEvidence.trim());
  const hasAcceptance = Boolean(
    (acceptanceEvidence.length >= 12 && !isPlaceholder)
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
    }
  ];
  if (!fields.issuetype?.subtask) {
    checks.push({
      id: 'subtasks',
      label: 'Subtasks are complete',
      passed: subtasks.length > 0 && unfinished.length === 0,
      detail: !subtasks.length ? 'Add subtasks so completion can be checked.'
        : unfinished.length ? `Finish ${unfinishedNames.join(', ')} before handoff.`
          : `${subtasks.length} subtasks checked.`
    });
  }
  if (blockers.length) {
    checks.push({
      id: 'blockers',
      label: 'Blocking issues are complete',
      passed: false,
      detail: `Resolve ${blockers.join(', ')} before handoff.`
    });
  }
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
      : `All ${checks.length} checks have evidence. Review the actual work before handoff.`,
    note: 'This is an evidence check, not a release approval. Review the work before shipping.'
  };
}
