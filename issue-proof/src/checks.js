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

export function localToday(now = new Date()) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function assessIssue(issue, today = localToday()) {
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
  const stoppedResolution = /^(?:won['’]?t (?:do|fix|complete)|will not do|not (?:done|planned)|cannot complete|incomplete|deferred|unresolved|cancelled|canceled|duplicate|rejected|declined|can['’]?t reproduce|cannot reproduce|out of scope|obsolete|abandoned)$/i;
  const isStopped = (fields) => [fields?.status?.name, fields?.resolution?.name]
    .some((name) => typeof name === 'string' && stoppedResolution.test(name.trim()));
  // Jira Cloud examples use both "done" and "completed" for the green status category.
  const isCompleted = (fields) => ['done', 'completed'].includes(fields?.status?.statusCategory?.key)
    && !isStopped(fields)
    // The full issue reply includes resolution. An explicit null means Jira still
    // treats this issue as unresolved, even when its status is green.
    && (!Object.hasOwn(fields, 'resolution') || Boolean(fields.resolution?.name?.trim()));
  const unfinished = subtasks.filter((item) => !isCompleted(item.fields));
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
  const blockers = blockingIssues.filter((item) => !isCompleted(item.fields));
  const parsedDate = typeof fields.duedate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(fields.duedate)
    ? new Date(`${fields.duedate}T00:00:00Z`) : null;
  const dueDate = parsedDate && !Number.isNaN(parsedDate.valueOf())
    && parsedDate.toISOString().slice(0, 10) === fields.duedate ? fields.duedate : '';
  const overdue = Boolean(dueDate && dueDate < today);
  const stopped = isStopped(fields);
  const done = isCompleted(fields);
  const withoutMarkdownHeading = (text) => text.replace(/^#{1,6}[ \t]+/, '').trim();
  const criteriaHeading = /^(?:acceptance criteria|definition of done|success criteria|done when)[ \t]*(?::|[\u2013\u2014-]|$)/i;
  const acceptanceIndex = descriptionBlocks.findIndex((block) =>
    block.node?.type !== 'codeBlock' && criteriaHeading.test(withoutMarkdownHeading(block.text)));
  const acceptanceHeadings = descriptionBlocks.flatMap((block, index) =>
    criteriaHeading.test(withoutMarkdownHeading(block.text)) ? [index] : []);
  const isPlaceholder = (text) => /^(?:tbd|tbc|todo|wip|none|n\/a|not applicable|to be (?:determined|defined|added|confirmed)|coming soon|pending|see (?:later|ticket))\.?$/i.test(text.trim());
  const hasUnfinishedMarker = (text) => /\b(?:tbd|tbc|todo|wip|to be (?:determined|defined|added|confirmed)|coming soon|(?:pending|awaiting|needs?|requires?) (?:review|decision|confirmation|approval|verification|testing|qa|uat|sign-off)|(?:review|decision|confirmation|approval|verification|testing|tests?) (?:is |are )?(?:pending|required|needed|awaited|in progress|outstanding|failed|incomplete)|(?:approval|verification|testing|tests?) (?:was |were |has )?(?:denied|rejected|failed)|(?:approval|verification|testing|tests?) (?:has |have |was |were |is |are )?not (?:been )?(?:granted|completed|passed)|(?:not|never) (?:approved|verified|tested|passed)|not yet (?:reviewed|decided|confirmed|approved|verified|tested)|(?:could not|cannot|can't|unable to) (?:verify|approve|test|pass)|(?:approval|verification|testing|tests?) (?:remains? (?:open|pending|in progress|outstanding)|is blocked|are blocked|still needs?\b))\b|\.{3,}|\?{3,}/i.test(text)
    || /\b(?:is|are|was|were|remains?|still)\s+(?:(?:not|never)\s+started|(?:still\s+)?(?:in progress|underway|ongoing|incomplete))\b/i.test(text)
    || /\b(?:review|sign-off|approval|verification|testing|tests?|qa|uat) (?:has|have|is|are|was|were) (?:not (?:yet )?started|underway|in progress)\b|\b(?:review|sign-off|approval|verification|testing|tests?|qa|uat) (?:never|not yet) (?:started|finished|completed)\b/i.test(text)
    || /\b(?:review|sign-off|approval|verification) (?:remains?|is|are|was|were) (?:open|pending|in progress|outstanding|blocked|failed|missing|needed|required|incomplete|revoked|expired|withdrawn|cancelled|canceled)\b|\b(?:review|sign-off|approval|verification) (?:still )?(?:pending|failed|missing|needed|required|incomplete|revoked|expired|withdrawn|cancelled|canceled)\b|\b(?:cancelled|canceled|withdrew|withdrawn|revoked) (?:\w+ ){0,3}(?:approval|sign-off|review|verification)\b|\b(?:not yet|not|never) signed off\b|\b(?:has|have) not (?:yet )?signed off\b|\b(?:waiting for|blocked by) (?:\w+ ){0,4}(?:review|sign-off|approval|verification|testing|tests?|qa|uat)\b/i.test(text)
    || /\b(?:did not|didn't|has not|hasn't|have not|haven't|could not|couldn't|failed to|unable to)\s+(?:\w+\s+){0,3}(?:receive|send|deliver|show|display|create|save|pass|complete|finish|generate|record|produce)\b/i.test(text)
    || /\b(?:receipts?|reports?|results?|confirmations?|outputs?|records?)\s+(?:(?:was|were|is|are|has|have)\s+)?not\s+(?:been\s+)?(?:received|sent|delivered|shown|displayed|created|saved|generated|recorded|produced)\b/i.test(text)
    || /\b(?:receipts?|reports?|results?|confirmations?|outputs?|records?)\s+(?:(?:wasn['’]t|isn['’]t|weren['’]t|aren['’]t)\s+|(?:hasn['’]t|haven['’]t)\s+been\s+)(?:received|sent|delivered|shown|displayed|created|saved|generated|recorded|produced)\b/i.test(text)
    || /\b(?:0|no|zero)\s+(?:\w+\s+){0,3}(?:receipts?|reports?|results?|confirmations?|outputs?|records?)\s+(?:was\s+|were\s+|has\s+been\s+)?(?:received|sent|delivered|shown|displayed|created|saved|generated|recorded|produced)\b/i.test(text)
    || /\b(?:receipt|report|result|confirmation|output|record)s?\s+(?:(?:is|are|was|were|remains?)\s+)?(?:still\s+)?(?:pending|failed|missing|absent|unavailable|incomplete)\b/i.test(text);
  const failedDelivery = /\b(?:demo|artifact|build|deployment|release|upload|handoff|delivery)\s+(?:(?:is|was|has been|had been)\s+)?(?:failed|blocked|missing|incomplete|unsuccessful)\b|\b(?:failed|blocked|incomplete)\s+(?:demo|artifact|build|deployment|release|upload|handoff|delivery)\b/i;
  const unavailableProof = /\b(?:video|screenshot|demo link|installation link|judge link|published build)\s+(?:(?:is|was|remains|has been)\s+)?(?:not\s+(?:recorded|uploaded|attached|available|working)|missing|broken|unavailable|failed)\b|\b(?:video|screenshot|demo link|installation link|judge link)\s+(?:wasn['’]t|isn['’]t|hasn['’]t been)\s+(?:recorded|uploaded|attached|available|working)\b|\bno\s+(?:judge\s+)?(?:installation|demo)\s+link\s+(?:exists|was provided)\b/i;
  const missingDeliveryAction = /\b(?:demo|artifact|build|deployment|release|upload|handoff|delivery)\s+(?:(?:(?:was|were|is|are|has|have|had)\s+)?(?:still\s+)?(?:not|never)\s+(?:been\s+)?|(?:wasn['’]t|weren['’]t|isn['’]t|aren['’]t)\s+|(?:hasn['’]t|haven['’]t|hadn['’]t)\s+been\s+)(?:uploaded|deployed|published|released|built|delivered|completed|saved|created)\b/i;
  const promisedResult = /\b(?:will|shall|should|must|needs? to|plans? to|is going to|are going to)\s+(?:(?:be|get)\s+)?(?:pass(?:ed)?|complet(?:e|ed)|verif(?:y|ied)|approv(?:e|ed)|deliver(?:ed)?|creat(?:e|ed)|sav(?:e|ed)|generat(?:e|ed)|record(?:ed)?|produc(?:e|ed)|receiv(?:e|ed)|send|sent|ship(?:ped)?)\b/i;
  const vagueResult = /^(?:(?:it|this|the (?:feature|app|issue))\s+)?(?:works? (?:as expected|correctly|properly|well)|looks? good|is (?:done|ready|complete)|has no bugs)(?:\.|!)?$/i;
  const hasPartialVerification = (text) => {
    const counts = text.matchAll(/\b(\d+)\s*(?:\/|(?:out )?of)\s*(\d+)\s+(?:\w+\s+){0,2}?(?:tests?|checks?|cases?|scenarios?|receipts?|reports?|results?|confirmations?|outputs?|records?)\s+(?:pass(?:ed)?|completed|verified|succeed(?:ed)?|received|sent|delivered|shown|displayed|created|saved|generated|recorded|produced)\b/gi);
    const reversedCounts = text.matchAll(/\b(?:tests?|checks?|cases?|scenarios?|receipts?|reports?|results?|confirmations?|outputs?|records?)\s+(?:pass(?:ed)?|completed|verified|succeed(?:ed)?|received|sent|delivered|shown|displayed|created|saved|generated|recorded|produced)\s*:?\s*(\d+)\s*(?:\/|(?:out )?of)\s*(\d+)\b/gi);
    return [...counts, ...reversedCounts].some((count) => Number(count[2]) === 0 || Number(count[1]) !== Number(count[2]));
  };
  const withoutZeroFailures = (text) => text
    .replace(/\b(?:0|zero|no)\s+(?:tests?|checks?|cases?|scenarios?|receipts?|reports?|results?|confirmations?|outputs?|records?)\s+(?:fails?|failed|failing|errored|rejected|missing|undelivered)\b/gi, '')
    .replace(/\b(?:tests?|checks?|cases?|scenarios?|receipts?|reports?|results?|confirmations?|outputs?|records?)\s+(?:fails?|failed|failing|errored|rejected|missing|undelivered)\s*[:=]\s*(?:0|zero)\b/gi, '');
  const hasFailedEvidence = (text) => {
    return /\b(?:[1-9]\d*|one|two|three|four|five|six|seven|eight|nine|ten|some|several|all)\s+(?:\w+\s+){0,2}?(?:tests?|checks?|cases?|scenarios?|receipts?|reports?|results?|confirmations?|outputs?|records?)\s+(?:fails?|failed|failing|errored|rejected|missing|undelivered|did not pass)\b/i.test(text)
    || /\b(?:[1-9]\d*|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:failed|failing|rejected|missing|undelivered)\b/i.test(text)
    || /\b(?:fail(?:ed|ing|ures?)?|errors?|errored|rejected|missing|undelivered)\s*[:=]\s*[1-9]\d*\b/i.test(text)
    || /\b(?:fail(?:ed|ing|ures?)?|rejected|missing|undelivered)\s+[1-9]\d*\b/i.test(text)
    || /\b(?:tests?|checks?|cases?|scenarios?|receipts?|reports?|results?|confirmations?|outputs?|records?)\s+(?:(?:has|have|had|was|were|is|are)\s+)?(?:failed|failing|rejected|missing|undelivered|did not pass)\b/i.test(text)
    || /\b(?:tests?|checks?|cases?|scenarios?|receipts?|reports?|results?|confirmations?|outputs?|records?)\s+(?:pass|passes|passed|complete|completes|completed|verify|verifies|verified|succeed|succeeds|succeeded|receive|receives|received|send|sends|sent|deliver|delivers|delivered|create|creates|created|save|saves|saved)\s+(?:except|but not)\s+(?:for\s+)?(?:[1-9]\d*|one|two|three|four|five|six|seven|eight|nine|ten|some|several|a single|an additional)\b/i.test(text)
    || /\b(?:[1-9]\d*|one|two|three|four|five|six|seven|eight|nine|ten|some|several|all)\s+(?:\w+\s+){0,2}?(?:tests?|checks?|cases?|scenarios?)\s+(?:(?:was|were)\s+)?skipp?ed\b/i.test(text)
    || /\b(?:[1-9]\d*|one|two|three|four|five|six|seven|eight|nine|ten|some|several|all)\s+skipp?ed\s+(?:\w+\s+){0,2}?(?:tests?|checks?|cases?|scenarios?)\b/i.test(text)
    || /\b(?:tests?|checks?|cases?|scenarios?)\s+skipp?ed\s*:\s*[1-9]\d*\b/i.test(text)
    || /\b(?:tests?|checks?|cases?|scenarios?)\s+(?:were\s+)?skipp?ed\s*[,;:]?\s*(?:[1-9]\d*|one|two|three|four|five|six|seven|eight|nine|ten|some|several)\b/i.test(text)
    || /\b(?:tests?|checks?|cases?|scenarios?|receipts?|reports?|results?|confirmations?|outputs?|records?)\s+(?:passed|completed|verified|succeeded|received|sent|delivered|shown|displayed|created|saved|generated|recorded|produced)\s*[,;]\s*(?:[1-9]\d*|one|two|three|four|five|six|seven|eight|nine|ten|some|several)\s+(?:failed|failing|errors?|errored|rejected|missing|undelivered)\b/i.test(text)
    || /\b(?:[1-9]\d*|one|two|three|four|five|six|seven|eight|nine|ten|some|several)\s+(?:failed|failing|rejected|missing|undelivered)\s*[,;]\s*(?:[1-9]\d*|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:tests?|checks?|cases?|scenarios?|receipts?|reports?|results?|confirmations?|outputs?|records?)\s+(?:passed|completed|verified|succeeded|received|sent|delivered)\b/i.test(text)
    || /\b[1-9]\d*\s*(?:\/|(?:out )?of)\s*[1-9]\d*\s+(?:\w+\s+){0,2}?(?:tests?|checks?|cases?|scenarios?|receipts?|reports?|results?|confirmations?|outputs?|records?)\s+(?:failed|failing|rejected|missing|undelivered)\b/i.test(text)
    || /\b(?:tests?|checks?|cases?|scenarios?|receipts?|reports?|results?|confirmations?|outputs?|records?)\s+(?:fails?|failed|failing|rejected|missing|undelivered)\s*:\s*[1-9]\d*\b/i.test(text)
    || /\b(?:[1-9]\d*|one|two|three|four|five|six|seven|eight|nine|ten|some|several|all)\s+(?:failed|failing|errored|rejected|missing|undelivered)\s+(?:\w+\s+){0,2}?(?:tests?|checks?|cases?|scenarios?|receipts?|reports?|results?|confirmations?|outputs?|records?)\b/i.test(text)
    || /\b(?:[1-9]\d*|one|two|three|four|five|six|seven|eight|nine|ten|some|several)\s+errors?\b/i.test(text);
  };
  const hasUnfinishedEvidence = (text) => /\b(?:[1-9]\d*|one|two|three|four|five|six|seven|eight|nine|ten|some|several)\s+(?:\w+\s+){0,2}?(?:tests?|checks?|cases?|scenarios?|receipts?|reports?|results?|confirmations?|outputs?|records?)\s+(?:(?:are|were|remain)\s+)?(?:pending|blocked|incomplete|unverified|awaiting\s+review)\b/i.test(text)
    || /\b(?:tests?|checks?|cases?|scenarios?|receipts?|reports?|results?|confirmations?|outputs?|records?)\s+(?:pending|blocked|incomplete|unverified)\s*[:=]\s*[1-9]\d*\b/i.test(text)
    || /\b(?:[1-9]\d*|one|two|three|four|five|six|seven|eight|nine|ten|some|several)\s+(?:\w+\s+){0,2}?(?:tests?|checks?|cases?|scenarios?)\s+(?:(?:were|are|remain)\s+)?(?:not run|not executed|untested)\b/i.test(text)
    || /\b(?:tests?|checks?|cases?|scenarios?)\s+(?:not run|not executed|untested)\s*[:=]\s*[1-9]\d*\b/i.test(text)
    || /(?<!0 )(?<!zero )\b(?:tests?|checks?|cases?|scenarios?)\s+(?:(?:were|was|are|is|remain|remains)\s+)?(?:not run|not executed|untested|skipp?ed)\b/i.test(text);
  const hasZeroEvidence = (text) => /\b(?:0|zero|no)\s+(?:\w+\s+){0,2}?(?:tests?|checks?|cases?|scenarios?|receipts?|reports?|results?|confirmations?|outputs?|records?)\s+(?:(?:was|were|has been|have been)\s+)?(?:passed|completed|verified|succeeded|received|sent|delivered|created|saved|generated|recorded|produced)\b/i.test(text)
    || /\b(?:tests?|checks?|cases?|scenarios?|receipts?|reports?|results?|confirmations?|outputs?|records?)\s+(?:passed|completed|verified|succeeded|received|sent|delivered|created|saved|generated|recorded|produced)\s*[:=]\s*(?:0|zero)\b/i.test(text);
  const isSpecific = (text) => {
    const result = text.trim().replace(/^(?:\[[xX ]\]|[\u2610\u2611\u25a1])\s*/, '').trim();
    const assessment = withoutZeroFailures(result);
    return result.length >= 12 && !isPlaceholder(result)
      && !hasUnfinishedMarker(assessment) && !hasPartialVerification(assessment)
      && !hasFailedEvidence(assessment) && !hasUnfinishedEvidence(assessment)
      && !hasZeroEvidence(result) && !failedDelivery.test(assessment)
      && !unavailableProof.test(assessment)
      && !missingDeliveryAction.test(assessment) && !promisedResult.test(result)
      && !vagueResult.test(result);
  };
  const acceptanceLines = [];
  const acceptanceBlocks = [];
  const inlineAcceptance = [];
  const sectionCounts = [];
  for (const headingIndex of acceptanceHeadings) {
    const initialCount = acceptanceLines.length;
    const headingText = withoutMarkdownHeading(descriptionBlocks[headingIndex].text)
      .replace(/^(?:acceptance criteria|definition of done|success criteria|done when)[ \t]*(?::|[\u2013\u2014-])?[ \t]*/i, '');
    inlineAcceptance.push(headingText);
    if (headingText && !isPlaceholder(headingText)) {
      acceptanceLines.push(...headingText.split('\n').map((line) =>
        line.trim().replace(/^(?:[-*\u2022]|\d+[.)])\s*/, '').trim()));
    }
    for (const block of descriptionBlocks.slice(headingIndex + 1)) {
      if (block.node?.type === 'codeBlock') continue;
      const nextSection = /^#{1,6}[ \t]+\S/.test(block.text)
        || /^(?:implementation(?: notes?)?|technical notes?|background|context|risks?|dependencies|test plan|design|out of scope|non-goals?|release notes?|deployment notes?)\s*(?::\s*.*)?$/i.test(block.text)
        || /^[a-z][^:]{2,40}:\s*$/i.test(block.text);
      if (block.heading || nextSection) break;
      acceptanceBlocks.push(block);
      acceptanceLines.push(...block.text.split('\n').map((line) =>
        line.replace(/^(?:[-*\u2022]|\d+[.)])\s*/, '').trim()));
    }
    sectionCounts.push(acceptanceLines.slice(initialCount).filter(Boolean).length);
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
        && !promisedResult.test(line.text)
        && !hasFailedEvidence(line.text) && !hasZeroEvidence(line.text)
    );
    return (singleLine && !hasUnfinishedMarker(block.text)
      && !promisedResult.test(block.text)
      && !hasFailedEvidence(block.text) && !hasZeroEvidence(block.text)) || separateLines;
  });
  let inTechnicalSection = false;
  const failedStandaloneScenario = acceptanceIndex < 0 && descriptionBlocks.some((block) => {
    if (block.node?.type === 'codeBlock') return false;
    const technicalHeading = /^(?:implementation(?: notes?)?|technical notes?|deployment notes?|test plan)\s*(?::\s*.*)?$/i.test(withoutMarkdownHeading(block.text));
    if (technicalHeading) inTechnicalSection = true;
    else if (block.heading || /^#{1,6}[ \t]+\S/.test(block.text)) inTechnicalSection = false;
    if (inTechnicalSection) return false;
    if (!/\bgiven\b.{1,100}\bwhen\b.{1,100}\bthen\b.{1,100}\S/i.test(block.text)) return false;
    return hasUnfinishedMarker(block.text) || promisedResult.test(block.text)
      || hasFailedEvidence(block.text) || hasZeroEvidence(block.text);
  });
  const listedCriteria = acceptanceLines.filter(Boolean);
  const firstUnclearCriterion = listedCriteria.find((line) => !isSpecific(line));
  const uncheckedCriteria = acceptanceIndex >= 0
    ? [
      ...[...inlineAcceptance.flatMap((text) => text.split('\n')), ...acceptanceBlocks.flatMap((block) => block.text.split('\n'))]
        .filter((line) => /^\s*(?:>\s*)*(?:(?:[-*\u2022]|\d+[.)])\s*)?(?:\[\s\]|[\u2610\u25a1])/.test(line))
        .map((line) => line.replace(/^\s*(?:>\s*)*(?:(?:[-*\u2022]|\d+[.)])\s*)?(?:\[\s\]|[\u2610\u25a1])\s*/, '').trim()),
      ...openTaskLabels(acceptanceBlocks.map((block) => block.node))
    ].filter(Boolean)
    : [];
  const hasAcceptance = acceptanceIndex >= 0
    ? sectionCounts.every((count) => count > 0) && acceptanceHeadings.every((_, index) => {
      const text = inlineAcceptance[index];
      return !text || !isPlaceholder(text);
    }) && listedCriteria.length > 0 && listedCriteria.every(isSpecific)
      && uncheckedCriteria.length === 0
    : standaloneScenario && !failedStandaloneScenario;
  const checks = [
    {
      id: 'owner',
      label: 'An owner is assigned',
      passed: Boolean(fields.assignee?.accountId) && fields.assignee.active !== false,
      detail: fields.assignee?.active === false && fields.assignee?.accountId
        ? `${fields.assignee.displayName || 'The assigned user'} is inactive in Jira. Assign an active owner before handoff.`
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
          : `Checked subtasks: ${subtasks.map((item) => item.key).join(', ')}.`
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
        : `Checked blocking issues: ${blockingIssues.map((item) => item.key).join(', ')}.`
    });
  }
  checks.push({
    id: 'status',
    label: 'Issue is marked done',
    passed: done,
    detail: stopped
      ? `This issue was closed as ${fields.resolution?.name || fields.status?.name}. Complete the work before handoff.`
      : ['done', 'completed'].includes(fields.status?.statusCategory?.key)
        && Object.hasOwn(fields, 'resolution') && !fields.resolution?.name?.trim()
        ? 'Jira still marks this issue unresolved. Set a completion resolution before handoff.'
      : done
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
