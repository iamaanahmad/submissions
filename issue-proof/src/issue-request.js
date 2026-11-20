import { issueFetchError } from './issue-error.js';

export async function fetchIssue(requestJira, issueKey, timeoutMs = 15000, expectedIssueId) {
  let timer;
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
        if (!issue || typeof issue.key !== 'string' || !issue.key
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
              || typeof issue.fields.assignee.accountId !== 'string'
              || typeof issue.fields.assignee.active !== 'boolean'))
          || !Object.hasOwn(issue.fields, 'duedate')
          || (issue.fields.duedate !== null && typeof issue.fields.duedate !== 'string')
          || typeof issue.fields.status?.name !== 'string'
          || typeof issue.fields.status?.statusCategory?.key !== 'string'
          || !Object.hasOwn(issue.fields, 'resolution')
          || (issue.fields.resolution !== null
            && (typeof issue.fields.resolution !== 'object'
              || Array.isArray(issue.fields.resolution)
              || typeof issue.fields.resolution.name !== 'string'))
          || typeof issue.fields.issuetype?.subtask !== 'boolean'
          || !Array.isArray(issue.fields.subtasks)
          || !Array.isArray(issue.fields.issuelinks)
          || issue.fields.subtasks.some((item) =>
            !item || typeof item.key !== 'string'
            || typeof item.fields?.status?.name !== 'string'
            || typeof item.fields?.status?.statusCategory?.key !== 'string')
          || issue.fields.issuelinks.some((link) =>
            !link || typeof link.type?.inward !== 'string'
            || typeof link.type?.outward !== 'string'
            || Boolean(link.inwardIssue) === Boolean(link.outwardIssue)
            || (link.inwardIssue && (typeof link.inwardIssue.key !== 'string'
              || typeof link.inwardIssue.fields?.status?.name !== 'string'
              || typeof link.inwardIssue.fields?.status?.statusCategory?.key !== 'string'))
            || (link.outwardIssue && (typeof link.outwardIssue.key !== 'string'
              || typeof link.outwardIssue.fields?.status?.name !== 'string'
              || typeof link.outwardIssue.fields?.status?.statusCategory?.key !== 'string')))) {
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
        if (keys.length > 20) {
          throw new Error('This issue has too many related issues to check safely. Review the links in Jira.');
        }
        // Keep a snapshot before enriching embedded related issues below.
        const parentSnapshot = JSON.stringify(issue);
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
          if (detail?.key !== key || typeof detail.fields?.status?.name !== 'string'
            || typeof detail.fields?.status?.statusCategory?.key !== 'string'
            || !Object.hasOwn(detail.fields, 'resolution')
            || (detail.fields.resolution !== null && typeof detail.fields.resolution?.name !== 'string')) {
            throw new Error('Jira returned incomplete related work. Check issue access, then try again.');
          }
          return [key, detail.fields];
        };
        const details = await Promise.all(keys.map(readRelated));
        if (keys.length) {
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
          if (JSON.stringify(latest) !== parentSnapshot) {
            throw new Error('The main Jira issue changed during this check. Check again before handoff.');
          }
          // A linked issue can change while the main issue stays unchanged.
          // Recheck its live status before using the earlier related-work snapshot.
          const confirmed = await Promise.all(keys.map(readRelated));
          const firstRead = new Map(details);
          if (confirmed.some(([key, fields]) => JSON.stringify(fields) !== JSON.stringify(firstRead.get(key)))) {
            throw new Error('Related Jira work changed during this check. Check again before handoff.');
          }
        }
        const byKey = new Map(details);
        for (const item of related) item.fields = { ...item.fields, ...byKey.get(item.key) };
        return issue;
      })(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Jira took too long to respond. Check your connection, then try again.')), timeoutMs);
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
}
