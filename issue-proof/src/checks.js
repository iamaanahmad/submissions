function adfText(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(adfText).filter(Boolean).join('\n');
  if (value.type === 'hardBreak') return '\n';
  const blockContainer = new Set([
    'doc', 'bulletList', 'orderedList', 'taskList', 'listItem', 'blockquote',
    'table', 'tableRow', 'tableCell', 'tableHeader'
  ]);
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
    const match = line.match(/^\s*(?:>\s*)*(?:(?:[-*\u2022]|\d+[.)])\s*)?(?:\[\s\]|[\u2610\u25a1])\s*(.*)$/);
    return match ? [match[1].trim() || 'an unnamed checklist item'] : [];
  });
}

function withoutFencedCode(text, state = { fence: null }) {
  return text.split('\n').filter((line) => {
    const marker = line.match(/^\s*(?:>\s*)*(`{3,}|~{3,})(.*)$/);
    if (marker) {
      const token = marker[1];
      const trailingText = marker[2].trim();
      if (!state.fence) state.fence = token;
      else if (token[0] === state.fence[0] && token.length >= state.fence.length
        && trailingText === '') state.fence = null;
      return false;
    }
    return !state.fence;
  }).join('\n');
}

function withoutInlineCode(text) {
  return text.replace(/(`+)([^`\n]|(?!\1)`)*\1/g, '');
}

function descriptionWithoutCode(value) {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(descriptionWithoutCode).filter(Boolean);
  if (value.type === 'codeBlock' || value.marks?.some((mark) => mark.type === 'code')) return null;
  return { ...value, content: descriptionWithoutCode(value.content) };
}

export function assessIssue(issue, today = new Date().toISOString().slice(0, 10)) {
  const fields = issue?.fields || {};
  const checklistDescription = descriptionWithoutCode(fields.description);
  const description = withoutInlineCode(withoutFencedCode(adfText(checklistDescription)));
  const fenceState = { fence: null };
  const descriptionBlocks = Array.isArray(checklistDescription?.content)
    ? checklistDescription.content.map((block) => ({
      node: block,
      text: block.type === 'codeBlock' ? '' : withoutInlineCode(withoutFencedCode(adfText(block), fenceState)).trim(),
      heading: block.type === 'heading',
      openTask: hasOpenTask(block)
    })).filter((block) => block.text)
    : description.split('\n').map((text) => ({ node: null, text: text.trim(), heading: false })).filter((block) => block.text);
  const subtasks = fields.subtasks || [];
  const unfinished = subtasks.filter((item) => item.fields?.status?.statusCategory?.key !== 'done');
  const unfinishedNames = unfinished.map((item) => item.key || item.fields?.summary || 'Unnamed subtask');
  const openChecklistItems = [
    ...openTaskLabels(checklistDescription),
    ...openTextChecklistLabels(withoutInlineCode(withoutFencedCode(adfText(checklistDescription))))
  ];
  const blockingIssues = (fields.issuelinks || []).flatMap((link) => {
    const isBlockingLabel = (label) => /^(?:(?:is )?blocked by|(?:is )?depend(?:s|ent) (?:on|upon)|requires?)$/i.test(label?.trim() || '');
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
  const criteriaHeading = /^(?:acceptance criteria|definition of done|success criteria|done when)[ \t]*(?::|[\u2013\u2014-]|$)/i;
  const acceptanceIndex = descriptionBlocks.findIndex((block) =>
    block.node?.type !== 'codeBlock' && criteriaHeading.test(withoutMarkdownHeading(block.text)));
  const inlineAcceptance = acceptanceIndex >= 0
    ? withoutMarkdownHeading(descriptionBlocks[acceptanceIndex].text).replace(/^(?:acceptance criteria|definition of done|success criteria|done when)[ \t]*(?::|[\u2013\u2014-])?[ \t]*/i, '') : '';
  const isPlaceholder = (text) => /^(?:tbd|tbc|todo|wip|none|n\/a|not applicable|to be (?:determined|defined|added|confirmed)|coming soon|pending|see (?:later|ticket))\.?$/i.test(text.trim());
  const hasUnfinishedMarker = (text) => /\b(?:tbd|tbc|todo|wip|to be (?:determined|defined|added|confirmed)|coming soon|(?:pending|awaiting|needs?|requires?) (?:review|decision|confirmation|approval|verification|testing|qa|uat|sign-off)|(?:review|decision|confirmation|approval|verification|testing|tests?) (?:is |are )?(?:pending|required|needed|awaited|in progress|outstanding|failed|incomplete)|(?:approval|verification|testing|tests?) (?:was |were |has )?(?:denied|rejected|failed)|(?:approval|verification|testing|tests?) (?:has |have |was |were |is |are )?not (?:been )?(?:granted|completed|passed)|(?:not|never) (?:approved|verified|tested|passed)|not yet (?:reviewed|decided|confirmed|approved|verified|tested)|(?:could not|cannot|can't|unable to) (?:verify|approve|test|pass)|(?:approval|verification|testing|tests?) (?:remains? (?:open|pending|in progress|outstanding)|is blocked|are blocked|still needs?\b))\b|\.{3,}|\?{3,}/i.test(text)
    || /\b(?:review|sign-off|approval|verification|testing|tests?|qa|uat) (?:has|have|is|are|was|were) (?:not (?:yet )?started|underway|in progress)\b|\b(?:review|sign-off|approval|verification|testing|tests?|qa|uat) (?:never|not yet) (?:started|finished|completed)\b/i.test(text)
    || /\b(?:review|sign-off|approval|verification) (?:remains?|is|are|was|were) (?:open|pending|in progress|outstanding|blocked|failed|missing|needed|required|incomplete|revoked|expired|withdrawn|cancelled|canceled)\b|\b(?:review|sign-off|approval|verification) (?:still )?(?:pending|failed|missing|needed|required|incomplete|revoked|expired|withdrawn|cancelled|canceled)\b|\b(?:cancelled|canceled|withdrew|withdrawn|revoked) (?:\w+ ){0,3}(?:approval|sign-off|review|verification)\b|\b(?:not yet|not|never) signed off\b|\b(?:has|have) not (?:yet )?signed off\b|\b(?:waiting for|blocked by) (?:\w+ ){0,4}(?:review|sign-off|approval|verification|testing|tests?|qa|uat)\b/i.test(text);
  const vagueResult = /^(?:(?:it|this|the (?:feature|app|issue))\s+)?(?:works? (?:as expected|correctly|properly|well)|looks? good|is (?:done|ready|complete)|has no bugs)(?:\.|!)?$/i;
  const isSpecific = (text) => {
    const result = text.trim().replace(/^(?:\[[xX ]\]|[\u2610\u2611\u25a1])\s*/, '').trim();
    return result.length >= 12 && !isPlaceholder(result)
      && !hasUnfinishedMarker(result) && !vagueResult.test(result);
  };
  const acceptanceLines = [];
  const acceptanceBlocks = [];
  if (acceptanceIndex >= 0 && !isPlaceholder(inlineAcceptance)) {
    if (inlineAcceptance) acceptanceLines.push(...inlineAcceptance.split('\n').map((line) =>
      line.trim().replace(/^(?:[-*\u2022]|\d+[.)])\s*/, '').trim()));
    for (const block of descriptionBlocks.slice(acceptanceIndex + 1)) {
      if (block.node?.type === 'codeBlock') continue;
      const nextSection = /^#{1,6}[ \t]+\S/.test(block.text)
        || /^(?:implementation(?: notes?)?|technical notes?|background|context|risks?|dependencies|test plan|design|out of scope|non-goals?|release notes?|deployment notes?)\s*(?::\s*.*)?$/i.test(block.text)
        || /^[a-z][^:]{2,40}:\s*$/i.test(block.text);
      if (block.heading || nextSection) break;
      acceptanceBlocks.push(block);
      acceptanceLines.push(...block.text.split('\n').map((line) =>
        line.replace(/^(?:[-*\u2022]|\d+[.)])\s*/, '').trim()));
    }
  }
  let inImplementationSection = false;
  const standaloneScenario = acceptanceIndex < 0 && descriptionBlocks.some((block, index) => {
    if (block.node?.type === 'codeBlock') return false;
    const technicalHeading = /^(?:implementation(?: notes?)?|technical notes?|deployment notes?|test plan)\s*(?::\s*.*)?$/i.test(withoutMarkdownHeading(block.text));
    if (technicalHeading) inImplementationSection = true;
    else if (block.heading || /^#{1,6}[ \t]+\S/.test(block.text)) inImplementationSection = false;
    if (inImplementationSection) return false;
    const singleLine = /\bgiven\b.{1,100}\bwhen\b.{1,100}\bthen\b.{1,100}\S/i.test(block.text);
    const lines = descriptionBlocks.slice(index, index + 3);
    const separateLines = lines.length === 3 && lines.every((line, offset) =>
      !line.heading && line.node?.type !== 'codeBlock'
        && !/^(?:implementation(?: notes?)?|technical notes?|deployment notes?|test plan)\s*:/i.test(line.text)
        && new RegExp(`^${['given', 'when', 'then'][offset]}\\s+\\S`, 'i').test(line.text)
        && line.text.length >= 12 && !hasUnfinishedMarker(line.text)
    );
    return (singleLine && !hasUnfinishedMarker(block.text)) || separateLines;
  });
  const listedCriteria = acceptanceLines.filter(Boolean);
  const firstUnclearCriterion = listedCriteria.find((line) => !isSpecific(line));
  const uncheckedCriteria = acceptanceIndex >= 0
    ? [
      ...[...inlineAcceptance.split('\n'), ...acceptanceBlocks.flatMap((block) => block.text.split('\n'))]
        .filter((line) => /^\s*(?:>\s*)*(?:(?:[-*\u2022]|\d+[.)])\s*)?(?:\[\s\]|[\u2610\u25a1])/.test(line))
        .map((line) => line.replace(/^\s*(?:>\s*)*(?:(?:[-*\u2022]|\d+[.)])\s*)?(?:\[\s\]|[\u2610\u25a1])\s*/, '').trim()),
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
      passed: Boolean(fields.assignee?.accountId),
      detail: fields.assignee?.active === false && fields.assignee?.accountId
        ? `${fields.assignee.displayName || 'The assigned user'} owns this issue in Jira (inactive account).`
        : fields.assignee?.accountId
          ? fields.assignee.displayName || 'An owner is assigned in Jira.'
          : 'Assign someone who owns the next step.'
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
        : firstUnclearCriterion
          ? `Replace every placeholder or vague acceptance item with a specific result. Start with: ${firstUnclearCriterion}.`
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
