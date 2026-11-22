import { issueFetchError } from './issue-error.js';

const hasText = (value) => typeof value === 'string' && value.trim().length > 0;
const stableSnapshot = (value) => JSON.stringify(value, function (key, item) {
  // Jira can return the same relationships in a different order on reread.
  // Their contents matter for handoff, but their display order does not.
  if ((key === 'subtasks' || key === 'issuelinks') && Array.isArray(item)) {
    return [...item].sort((left, right) => stableSnapshot(left).localeCompare(stableSnapshot(right)));
  }
  if (item && !Array.isArray(item) && typeof item === 'object') {
    return Object.fromEntries(Object.keys(item).sort().map((key) => [key, item[key]]));
  }
  return item;
});

export async function fetchIssue(requestJira, issueKey, timeoutMs = 15000, expectedIssueId) {
  let timer;
  let rejectTimeout;
  try {
    const fields = 'summary,description,assignee,duedate,subtasks,issuetype,issuelinks,status,resolution';
    const path = `/rest/api/3/issue/${encodeURIComponent(issueKey)}?fields=${fields}`;
    return await Promise.race([
      (async () => {
        let response;
        try {
          response = await requestJira(path);
        } catch {
          throw new Error('Jira could not load this issue. Check your connection, then try again.');
        }
        if (!response || typeof response.ok !== 'boolean'
          || (!response.ok && typeof response.status !== 'number')) {
          throw new Error('Jira returned an invalid response. Check again, or ask a project admin to check issue access.');
        }
        if (!response.ok) throw new Error(issueFetchError(response.status));
        let issue;
        try {
          issue = await response.json();
        } catch {
          throw new Error('Jira returned an unreadable issue. Check again, or ask a project admin to check issue access.');
        }
        if (!issue || !hasText(issue.key)
          || (expectedIssueId != null && String(issue.id) !== String(expectedIssueId))
          || (/^\d+$/.test(String(issueKey)) && String(issue.id) !== String(issueKey))
          || (!/^\d+$/.test(String(issueKey)) && issue.key !== String(issueKey))
          || !issue.fields || typeof issue.fields !== 'object' || Array.isArray(issue.fields)
          || typeof issue.fields.summary !== 'string'
          || !Object.hasOwn(issue.fields, 'description')
          || (issue.fields.description !== null
            && typeof issue.fields.description !== 'string'
            && (typeof issue.fields.description !== 'object'
              || Array.isArray(issue.fields.description)
              || issue.fields.description.type !== 'doc'
              || !Array.isArray(issue.fields.description.content)))
          || !Object.hasOwn(issue.fields, 'assignee')
          || (issue.fields.assignee !== null
            && (typeof issue.fields.assignee !== 'object'
              || Array.isArray(issue.fields.assignee)
              || !hasText(issue.fields.assignee.accountId)
              || typeof issue.fields.assignee.active !== 'boolean'))
          || !Object.hasOwn(issue.fields, 'duedate')
          || (issue.fields.duedate !== null && typeof issue.fields.duedate !== 'string')
          || !hasText(issue.fields.status?.name)
          || !hasText(issue.fields.status?.statusCategory?.key)
          || !Object.hasOwn(issue.fields, 'resolution')
          || (issue.fields.resolution !== null
            && (typeof issue.fields.resolution !== 'object'
              || Array.isArray(issue.fields.resolution)
              || !hasText(issue.fields.resolution.name)))
          || typeof issue.fields.issuetype?.subtask !== 'boolean'
          || !Array.isArray(issue.fields.subtasks)
          || !Array.isArray(issue.fields.issuelinks)
          || issue.fields.subtasks.some((item) =>
            !item || !hasText(item.key)
            || !hasText(item.fields?.status?.name)
            || !hasText(item.fields?.status?.statusCategory?.key))
          || issue.fields.issuelinks.some((link) =>
            !link || typeof link.type?.inward !== 'string'
            || typeof link.type?.outward !== 'string'
            || Boolean(link.inwardIssue) === Boolean(link.outwardIssue)
            || (link.inwardIssue && (!hasText(link.inwardIssue.key)
              || !hasText(link.inwardIssue.fields?.status?.name)
              || !hasText(link.inwardIssue.fields?.status?.statusCategory?.key)))
            || (link.outwardIssue && (!hasText(link.outwardIssue.key)
              || !hasText(link.outwardIssue.fields?.status?.name)
              || !hasText(link.outwardIssue.fields?.status?.statusCategory?.key))))) {
          throw new Error('Jira returned an incomplete issue. Check again, or ask a project admin to check issue access.');
        }
        // Embedded subtask and issue-link summaries can be stale in either direction.
        // Read all related work directly before deciding whether it blocks handoff.
        const isBlockingLabel = (label) => /^(?:(?:is )?blocked by|(?:is )?depend(?:s|ent) (?:on|upon)|requires?)$/i.test(label?.trim() || '');
        const blockingIssues = issue.fields.issuelinks.flatMap((link) => {
          const item = isBlockingLabel(link.type.inward) ? link.inwardIssue
            : isBlockingLabel(link.type.outward) ? link.outwardIssue : null;
          return item ? [item] : [];
        });
        const related = [...issue.fields.subtasks, ...blockingIssues];
        const keys = [...new Set(related.map((item) => item.key))];
        const expectedIds = new Map();
        for (const item of related) {
          if (item.id == null) continue;
          const id = String(item.id);
          if (expectedIds.has(item.key) && expectedIds.get(item.key) !== id) {
            throw new Error('Jira returned conflicting related issues. Check the links in Jira, then try again.');
          }
          expectedIds.set(item.key, id);
        }
        if (keys.length > 20) {
          throw new Error('This issue has too many related issues to check safely. Review the links in Jira.');
        }
        // Each group needs two direct reads. Allow time for those extra Jira
        // round trips while keeping a hard limit on a stalled check.
        if (keys.length) {
          clearTimeout(timer);
          const batches = Math.ceil(keys.length / 4);
          timer = setTimeout(() => rejectTimeout(new Error('Jira took too long to respond. Check your connection, then try again.')),
            Math.min(60000, timeoutMs * (1 + batches)));
        }
        // Keep a snapshot before enriching embedded related issues below.
        const parentSnapshot = stableSnapshot(issue);
        const readRelated = async (key) => {
          let response;
          try {
            response = await requestJira(`/rest/api/3/issue/${encodeURIComponent(key)}?fields=status,resolution`);
          } catch {
            throw new Error('Jira could not check related work. Check your connection, then try again.');
          }
          if (!response?.ok) {
            throw new Error(typeof response?.status === 'number'
              ? issueFetchError(response.status)
              : 'Jira could not check related work. Check your connection, then try again.');
          }
          let detail;
          try {
            detail = await response.json();
          } catch {
            throw new Error('Jira returned unreadable related work. Try again.');
          }
          if (detail?.key !== key
            || !hasText(String(detail.id ?? ''))
            || (expectedIds.has(key) && String(detail.id) !== expectedIds.get(key))
            || !detail.fields || typeof detail.fields !== 'object' || Array.isArray(detail.fields)
            || !hasText(detail.fields?.status?.name)
            || !hasText(detail.fields?.status?.statusCategory?.key)
            || !Object.hasOwn(detail.fields, 'resolution')
            || (detail.fields.resolution !== null && !hasText(detail.fields.resolution?.name))) {
            throw new Error('Jira returned incomplete related work. Check issue access, then try again.');
          }
          return [key, detail.fields, detail.id];
        };
        const readInBatches = async () => {
          const results = [];
          // Keep linked-work checks below Jira's burst limits.
          for (let start = 0; start < keys.length; start += 4) {
            results.push(...await Promise.all(keys.slice(start, start + 4).map(readRelated)));
          }
          return results;
        };
        const details = await readInBatches();
        if (keys.length) {
          // Complete both related-work reads before checking the parent again.
          // Otherwise a parent edit during the final related read can pass.
          const confirmed = await readInBatches();
          const firstRead = new Map(details);
          const firstIds = new Map(details.map(([key, , id]) => [key, id]));
          if (confirmed.some(([key, fields, id]) =>
            stableSnapshot(fields) !== stableSnapshot(firstRead.get(key))
            || id !== firstIds.get(key))) {
            throw new Error('Related Jira work changed during this check. Check again before handoff.');
          }
        }
        // Recheck the main issue even when it has no related work. A Jira edit
        // during the first read must not become a passing handoff report.
        let latest;
        try {
          const response = await requestJira(path);
          if (!response?.ok) {
            throw new Error(typeof response?.status === 'number'
              ? issueFetchError(response.status)
              : 'Jira could not recheck the main issue. Check your connection, then try again.');
          }
          try {
            latest = await response.json();
          } catch {
            throw new Error('Jira returned an unreadable main issue. Check again.');
          }
        } catch (cause) {
          if (cause?.message?.startsWith('Jira ')) throw cause;
          throw new Error('Jira could not recheck the main issue. Check your connection, then try again.');
        }
        if (stableSnapshot(latest) !== parentSnapshot) {
          throw new Error('The main Jira issue changed during this check. Check again before handoff.');
        }
        const byKey = new Map(details);
        for (const item of related) item.fields = { ...item.fields, ...byKey.get(item.key) };
        return issue;
      })(),
      new Promise((_, reject) => {
        rejectTimeout = reject;
        timer = setTimeout(() => reject(new Error('Jira took too long to respond. Check your connection, then try again.')), timeoutMs);
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
}
