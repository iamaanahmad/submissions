import { issueFetchError } from './issue-error.js';

export async function fetchIssue(requestJira, issueKey, timeoutMs = 15000) {
  let timer;
  try {
    const fields = 'summary,description,assignee,duedate,subtasks,issuetype,issuelinks,status';
    const path = `/rest/api/3/issue/${encodeURIComponent(issueKey)}?fields=${fields}`;
    return await Promise.race([
      (async () => {
        const response = await requestJira(path);
        if (!response.ok) throw new Error(issueFetchError(response.status));
        const issue = await response.json();
        if (!issue || typeof issue.key !== 'string' || !issue.key
          || (/^\d+$/.test(String(issueKey)) && String(issue.id) !== String(issueKey))
          || (!/^\d+$/.test(String(issueKey)) && issue.key !== String(issueKey))
          || !issue.fields || typeof issue.fields !== 'object' || Array.isArray(issue.fields)
          || typeof issue.fields.summary !== 'string'
          || !Object.hasOwn(issue.fields, 'description')
          || !Object.hasOwn(issue.fields, 'assignee')
          || !Object.hasOwn(issue.fields, 'duedate')
          || typeof issue.fields.status?.statusCategory?.key !== 'string'
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
