function adfText(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(adfText).filter(Boolean).join('\n');
  if (value.type === 'hardBreak') return '\n';
  const blockContainer = new Set(['doc', 'bulletList', 'orderedList', 'taskList', 'listItem', 'blockquote']);
  const content = Array.isArray(value.content)
    ? value.content.map(adfText).filter(Boolean).join(blockContainer.has(value.type) ? '\n' : '')
    : '';
  return `${value.text || ''}${content}`;
}

function hasOpenTask(value) {
  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some(hasOpenTask);
  if ((value.type === 'taskItem' || value.type === 'blockTaskItem') && value.attrs?.state !== 'DONE') return true;
  return hasOpenTask(value.content);
}

function openTaskLabels(value) {
  if (!value || typeof value !== 'object') return [];
  if (Array.isArray(value)) return value.flatMap(openTaskLabels);
  if ((value.type === 'taskItem' || value.type === 'blockTaskItem') && value.attrs?.state !== 'DONE') {
    return [adfText(value).trim() || 'an unnamed checklist item'];
  }
  return openTaskLabels(value.content);
}

function openTextChecklistLabels(value) {
  return adfText(value).split('\n').flatMap((line) => {
    const match = line.match(/^\s*(?:(?:[-*\u2022]|\d+[.)])\s*)?(?:\[\s\]|[\u2610\u25a1])\s*(.*)$/);
    return match ? [match[1].trim() || 'an unnamed checklist item'] : [];
  });
}

export function assessIssue(issue, today = new Date().toISOString().slice(0, 10)) {
  const fields = issue?.fields || {};
  const description = adfText(fields.description);
  const descriptionBlocks = Array.isArray(fields.description?.content)
    ? fields.description.content.map((block) => ({
      node: block,
      text: adfText(block).trim(),
      heading: block.type === 'heading',
      openTask: hasOpenTask(block)
    })).filter((block) => block.text)
    : description.split('\n').map((text) => ({ node: null, text: text.trim(), heading: false })).filter((block) => block.text);
  const subtasks = fields.subtasks || [];
  const unfinished = subtasks.filter((item) => item.fields?.status?.statusCategory?.key !== 'done');
  const unfinishedNames = unfinished.map((item) => item.key || item.fields?.summary || 'Unnamed subtask');
  const openChecklistItems = [
    ...openTaskLabels(fields.description),
    ...openTextChecklistLabels(fields.description)
  ];
  const blockingIssues = (fields.issuelinks || []).flatMap((link) => {
    const isBlockingLabel = (label) => /^(?:is blocked by|depends on)$/i.test(label?.trim() || '');
    const isInwardBlocker = isBlockingLabel(link.type?.inward);
    const isOutwardBlocker = isBlockingLabel(link.type?.outward);
    const linkedIssue = isInwardBlocker ? link.inwardIssue
      : isOutwardBlocker ? link.outwardIssue : null;
    return linkedIssue ? [linkedIssue] : [];
  });
  const blockers = blockingIssues.filter((item) => item.fields?.status?.statusCategory?.key !== 'done');
  const parsedDate = typeof fields.duedate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(fields.duedate)
    ? new Date(`${fields.duedate}T00:00:00Z`) : null;
  const dueDate = parsedDate && !Number.isNaN(parsedDate.valueOf())
    && parsedDate.toISOString().slice(0, 10) === fields.duedate ? fields.duedate : '';
  const overdue = Boolean(dueDate && dueDate < today);
  const done = fields.status?.statusCategory?.key === 'done';
  const withoutMarkdownHeading = (text) => text.replace(/^#{1,6}[ \t]+/, '').trim();
  const criteriaHeading = /^(?:acceptance criteria|definition of done|success criteria|done when)[ \t]*(?::|$)/i;
  const acceptanceIndex = descriptionBlocks.findIndex((block) => criteriaHeading.test(withoutMarkdownHeading(block.text)));
  const inlineAcceptance = acceptanceIndex >= 0
    ? withoutMarkdownHeading(descriptionBlocks[acceptanceIndex].text).replace(/^(?:acceptance criteria|definition of done|success criteria|done when)[ \t]*:?[ \t]*/i, '') : '';
  const isPlaceholder = (text) => /^(?:tbd|todo|none|n\/a|not applicable|to be (?:determined|defined|added)|coming soon|pending|see (?:later|ticket))\.?$/i.test(text.trim());
  const hasUnfinishedMarker = (text) => /\b(?:tbd|todo|to be (?:determined|defined|added)|coming soon)\b|\.{3,}/i.test(text);
  const isSpecific = (text) => text.length >= 12 && !/^(?:\[\s\]|[\u2610\u25a1])/.test(text) && !isPlaceholder(text) && !hasUnfinishedMarker(text);
  const acceptanceLines = [];
  const acceptanceBlocks = [];
  if (acceptanceIndex >= 0 && !isPlaceholder(inlineAcceptance)) {
    if (inlineAcceptance) acceptanceLines.push(...inlineAcceptance.split('\n').map((line) =>
      line.trim().replace(/^(?:[-*\u2022]|\d+[.)])\s*/, '').trim()));
    for (const block of descriptionBlocks.slice(acceptanceIndex + 1)) {
      const nextSection = /^#{1,6}[ \t]+\S/.test(block.text)
        || /^(?:implementation notes?|technical notes?|background|context|risks?|dependencies|test plan|design|out of scope|non-goals?|release notes?|deployment notes?)\s*(?::\s*.*)?$/i.test(block.text)
        || /^[a-z][^:]{2,40}:\s*$/i.test(block.text);
      if (block.heading || nextSection) break;
      acceptanceBlocks.push(block);
      acceptanceLines.push(...block.text.split('\n').map((line) =>
        line.replace(/^(?:[-*\u2022]|\d+[.)])\s*/, '').trim()));
    }
  }
  const standaloneScenario = acceptanceIndex < 0 && descriptionBlocks.some((block, index) => {
    const singleLine = /\bgiven\b.{1,100}\bwhen\b.{1,100}\bthen\b.{1,100}\S/i.test(block.text);
    const lines = descriptionBlocks.slice(index, index + 3);
    const separateLines = lines.length === 3 && lines.every((line, offset) =>
      !line.heading && new RegExp(`^${['given', 'when', 'then'][offset]}\\s+\\S`, 'i').test(line.text)
        && line.text.length >= 12 && !hasUnfinishedMarker(line.text)
    );
    return (singleLine && !hasUnfinishedMarker(block.text)) || separateLines;
  });
  const listedCriteria = acceptanceLines.filter(Boolean);
  const uncheckedCriteria = acceptanceIndex >= 0
    ? [
      ...[...inlineAcceptance.split('\n'), ...acceptanceBlocks.flatMap((block) => block.text.split('\n'))]
        .filter((line) => /^\s*(?:(?:[-*\u2022]|\d+[.)])\s*)?(?:\[\s\]|[\u2610\u25a1])/.test(line))
        .map((line) => line.replace(/^\s*(?:(?:[-*\u2022]|\d+[.)])\s*)?(?:\[\s\]|[\u2610\u25a1])\s*/, '').trim()),
      ...openTaskLabels(acceptanceBlocks.map((block) => block.node))
    ].filter(Boolean)
    : [];
  const hasAcceptance = acceptanceIndex >= 0
    ? listedCriteria.length > 0 && listedCriteria.every(isSpecific)
      && uncheckedCriteria.length === 0
    : standaloneScenario;
  const checks = [
    {
      id: 'owner',
      label: 'An owner is assigned',
      passed: Boolean(fields.assignee?.accountId && fields.assignee.active !== false),
      detail: fields.assignee?.active === false
        ? `${fields.assignee.displayName || 'The assigned user'} is inactive. Assign an active owner.`
        : fields.assignee?.displayName || 'Assign someone who owns the next step.'
    },
    {
      id: 'deadline',
      label: 'A current target date is set',
      passed: Boolean(dueDate && (!overdue || done)),
      detail: overdue && done ? `${dueDate} was the target date for this completed issue.`
        : overdue ? `The ${dueDate} due date has passed. Set a current target date.`
        : dueDate || 'Set a due date so the work can be planned.'
    },
    {
      id: 'acceptance',
      label: 'Acceptance criteria are written',
      passed: hasAcceptance,
      detail: hasAcceptance ? `${listedCriteria.length || 1} written result${listedCriteria.length === 1 ? '' : 's'} to check.`
        : uncheckedCriteria.length
          ? `Finish ${uncheckedCriteria[0]}${uncheckedCriteria.length > 1 ? ` and ${uncheckedCriteria.length - 1} more checklist item${uncheckedCriteria.length === 2 ? '' : 's'}` : ''}.`
        : listedCriteria.length && listedCriteria.some(isSpecific)
          ? 'Replace every placeholder or vague acceptance item with a specific result.'
          : 'Write a specific result under Acceptance criteria or Given / When / Then.'
    }
  ];
  if (!fields.issuetype?.subtask && subtasks.length > 0) {
    checks.push({
      id: 'subtasks',
      label: 'Subtasks are complete',
      passed: unfinished.length === 0,
      detail: unfinished.length ? `Finish ${unfinishedNames.join(', ')} before handoff.`
          : `${subtasks.length} subtasks checked.`
    });
  }
  if (openChecklistItems.length) {
    checks.push({
      id: 'checklist',
      label: 'Jira checklist items are complete',
      passed: false,
      detail: `Finish ${openChecklistItems[0]}${openChecklistItems.length > 1 ? ` and ${openChecklistItems.length - 1} more checklist item${openChecklistItems.length === 2 ? '' : 's'}` : ''} before handoff.`
    });
  }
  if (blockingIssues.length) {
    checks.push({
      id: 'blockers',
      label: 'Blocking issues are complete',
      passed: blockers.length === 0,
      detail: blockers.length
        ? `Resolve ${blockers.map((item) => item.key || 'Linked issue').join(', ')} before handoff.`
        : `${blockingIssues.length} blocking issue${blockingIssues.length === 1 ? '' : 's'} checked.`
    });
  }
  checks.push({
    id: 'status',
    label: 'Issue is marked done',
    passed: fields.status?.statusCategory?.key === 'done',
    detail: fields.status?.statusCategory?.key === 'done'
      ? `${fields.status?.name || 'Done'} is the current status.`
      : `Move the issue to a done status after the work is verified. Current status: ${fields.status?.name || 'unknown'}.`
  });
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
