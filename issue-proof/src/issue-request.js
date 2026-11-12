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
        return response.json();
      })(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Jira took too long to respond. Check your connection, then try again.')), timeoutMs);
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
}
