import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchIssue } from '../src/issue-request.js';

test('returns a Jira issue and safely encodes its key', async () => {
  let path;
  const issue = { key: 'TEAM-1', fields: {} };
  const result = await fetchIssue(async (requestedPath) => {
    path = requestedPath;
    return { ok: true, json: async () => issue };
  }, 'TEAM-1/extra');
  assert.equal(result, issue);
  assert.match(path, /TEAM-1%2Fextra/);
});

test('does not show incomplete Jira data as missing handoff evidence', async () => {
  for (const issue of [null, {}, { key: 'TEAM-1' }, { key: 'TEAM-1', fields: [] }]) {
    await assert.rejects(
      fetchIssue(async () => ({ ok: true, json: async () => issue }), 'TEAM-1'),
      /Jira returned an incomplete issue.*Check again/
    );
  }
});

test('stalled Jira requests give a retry action instead of spinning forever', async () => {
  await assert.rejects(
    fetchIssue(() => new Promise(() => {}), 'TEAM-1', 5),
    /Jira took too long.*try again/
  );
});

test('Jira access errors retain their specific next step', async () => {
  await assert.rejects(
    fetchIssue(async () => ({ ok: false, status: 403 }), 'TEAM-1'),
    /project admin for issue access/
  );
});
