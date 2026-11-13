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
          || !issue.fields || typeof issue.fields !== 'object' || Array.isArray(issue.fields)
          || typeof issue.fields.summary !== 'string'
          || typeof issue.fields.status?.statusCategory?.key !== 'string'
          || typeof issue.fields.issuetype?.subtask !== 'boolean'
          || !Array.isArray(issue.fields.subtasks)
          || !Array.isArray(issue.fields.issuelinks)) {
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
