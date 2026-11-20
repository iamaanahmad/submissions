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
            || typeof item.fields?.status?.statusCategory?.key !== 'string')
          || issue.fields.issuelinks.some((link) =>
            !link || typeof link.type?.inward !== 'string'
            || typeof link.type?.outward !== 'string'
            || Boolean(link.inwardIssue) === Boolean(link.outwardIssue)
            || (link.inwardIssue && (typeof link.inwardIssue.key !== 'string'
              || typeof link.inwardIssue.fields?.status?.statusCategory?.key !== 'string'))
            || (link.outwardIssue && (typeof link.outwardIssue.key !== 'string'
              || typeof link.outwardIssue.fields?.status?.statusCategory?.key !== 'string')))) {
          throw new Error('Jira returned an incomplete issue. Check again, or ask a project admin to check issue access.');
        }
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
