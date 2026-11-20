import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchIssue } from '../src/issue-request.js';

test('returns a Jira issue and safely encodes its key', async () => {
  let path;
  const issue = { key: 'TEAM-1/extra', fields: {
    summary: 'Check the release', description: null, assignee: null, duedate: null, status: { statusCategory: { key: 'indeterminate' } },
    issuetype: { subtask: false }, subtasks: [], issuelinks: [], resolution: null
  } };
  const result = await fetchIssue(async (requestedPath) => {
    path = requestedPath;
    return { ok: true, json: async () => issue };
  }, 'TEAM-1/extra');
  assert.equal(result, issue);
  assert.match(path, /TEAM-1%2Fextra/);
  assert.match(path, /resolution/);
});

test('a key lookup cannot show evidence from another issue', async () => {
  const issue = { key: 'OTHER-2', fields: {
    summary: 'Other work', description: null, assignee: null, duedate: null,
    status: { statusCategory: { key: 'done' } }, issuetype: { subtask: false },
    subtasks: [], issuelinks: [], resolution: null
  } };
  await assert.rejects(
    fetchIssue(async () => ({ ok: true, json: async () => issue }), 'TEAM-1'),
    /Jira returned an incomplete issue.*Check again/
  );
});

test('returns the current key when Jira resolves an issue by stable ID', async () => {
  let path;
  const issue = { id: '10042', key: 'NEW-42', fields: {
    summary: 'Check the release', description: null, assignee: null, duedate: null, status: { statusCategory: { key: 'done' } },
    issuetype: { subtask: false }, subtasks: [], issuelinks: [], resolution: null
  } };
  const result = await fetchIssue(async (requestedPath) => {
    path = requestedPath;
    return { ok: true, json: async () => issue };
  }, '10042');
  assert.match(path, /\/issue\/10042\?/);
  assert.equal(result.key, 'NEW-42');
});

test('does not show another issue when Jira resolves the wrong stable ID', async () => {
  const issue = { id: '10043', key: 'OTHER-43', fields: {
    summary: 'Other work', description: null, assignee: null, duedate: null,
    status: { statusCategory: { key: 'done' } }, issuetype: { subtask: false },
    subtasks: [], issuelinks: [], resolution: null
  } };
  await assert.rejects(
    fetchIssue(async () => ({ ok: true, json: async () => issue }), '10042'),
    /Jira returned an incomplete issue.*Check again/
  );
});

test('a key lookup must match the open Jira issue ID', async () => {
  const fields = {
    summary: 'Check the release', description: null, assignee: null, duedate: null,
    status: { statusCategory: { key: 'done' } }, issuetype: { subtask: false },
    subtasks: [], issuelinks: [], resolution: null
  };
  const issue = { id: '10043', key: 'TEAM-1', fields };
  await assert.rejects(
    fetchIssue(async () => ({ ok: true, json: async () => issue }), 'TEAM-1', 15000, '10042'),
    /Jira returned an incomplete issue.*Check again/
  );
  assert.equal(await fetchIssue(async () => ({ ok: true, json: async () => issue }), 'TEAM-1', 15000, '10043'), issue);
});

test('does not show incomplete Jira data as missing handoff evidence', async () => {
  for (const issue of [
    null, {}, { key: 'TEAM-1' }, { key: 'TEAM-1', fields: [] },
    { key: 'TEAM-1', fields: {} },
    { key: 'TEAM-1', fields: { summary: 'Check the release' } },
    { key: 'TEAM-1', fields: { summary: 'Check the release', description: null, assignee: null, duedate: null, status: { statusCategory: { key: 'done' } } } }
  ]) {
    await assert.rejects(
      fetchIssue(async () => ({ ok: true, json: async () => issue }), 'TEAM-1'),
      /Jira returned an incomplete issue.*Check again/
    );
  }
});

test('unreadable Jira replies show a retry action instead of a parser error', async () => {
  await assert.rejects(
    fetchIssue(async () => ({ ok: true, json: async () => { throw new SyntaxError('Unexpected token'); } }), 'TEAM-1'),
    /Jira returned an unreadable issue.*Check again/
  );
});

test('failed Jira transport shows a retry action instead of an internal error', async () => {
  await assert.rejects(
    fetchIssue(async () => { throw new Error('Bridge connection failed with internal details'); }, 'TEAM-1'),
    /Jira could not load this issue.*try again/
  );
});

test('missing Jira response shows a retry action instead of an undefined status', async () => {
  await assert.rejects(
    fetchIssue(async () => undefined, 'TEAM-1'),
    /Jira returned an invalid response.*Check again/
  );
});

test('malformed Jira core fields require a retry instead of false missing evidence', async () => {
  const fields = {
    summary: 'Check the release', description: null, assignee: null, duedate: null,
    status: { statusCategory: { key: 'done' } }, issuetype: { subtask: false },
    subtasks: [], issuelinks: [], resolution: null
  };
  for (const changed of [
    { description: [] }, { description: { type: 'doc' } },
    { assignee: 'account-123' }, { assignee: {} },
    { assignee: { accountId: 'account-123' } },
    { assignee: { accountId: 'account-123', active: 'false' } },
    { duedate: 20261114 }
  ]) {
    await assert.rejects(
      fetchIssue(async () => ({ ok: true, json: async () => ({ key: 'TEAM-1', fields: { ...fields, ...changed } }) }), 'TEAM-1'),
      /Jira returned an incomplete issue.*Check again/
    );
  }
});

test('a Jira owner must have a verified activity state', async () => {
  const fields = {
    summary: 'Check the release', description: null, duedate: null,
    status: { statusCategory: { key: 'done' } }, issuetype: { subtask: false },
    subtasks: [], issuelinks: [], resolution: null
  };
  for (const active of [true, false]) {
    const issue = { key: 'TEAM-1', fields: {
      ...fields, assignee: { accountId: 'owner-123', active }
    } };
    assert.equal(await fetchIssue(async () => ({ ok: true, json: async () => issue }), 'TEAM-1'), issue);
  }
  await assert.rejects(
    fetchIssue(async () => ({ ok: true, json: async () => ({ key: 'TEAM-1', fields: {
      ...fields, assignee: { accountId: 'owner-123' }
    } }) }), 'TEAM-1'),
    /Jira returned an incomplete issue.*Check again/
  );
});

test('missing or malformed relationship lists cannot imply no blockers', async () => {
  const fields = {
    summary: 'Check the release', description: null, assignee: null, duedate: null, status: { statusCategory: { key: 'done' } },
    issuetype: { subtask: false }, subtasks: [], issuelinks: [], resolution: null
  };
  for (const changed of [
    { subtasks: undefined }, { issuelinks: undefined },
    { subtasks: null }, { issuelinks: {} }
  ]) {
    const issue = { key: 'TEAM-1', fields: { ...fields, ...changed } };
    await assert.rejects(
      fetchIssue(async () => ({ ok: true, json: async () => issue }), 'TEAM-1'),
      /Jira returned an incomplete issue.*Check again/
    );
  }
});

test('incomplete child and linked issue statuses require a retry', async () => {
  const fields = {
    summary: 'Check the release', description: null, assignee: null, duedate: null, status: { statusCategory: { key: 'done' } },
    issuetype: { subtask: false }, subtasks: [], issuelinks: [], resolution: null
  };
  const cases = [
    { subtasks: [{ key: 'TEAM-2', fields: {} }] },
    { subtasks: [{ fields: { status: { statusCategory: { key: 'done' } } } }] },
    { issuelinks: [{ type: { inward: 'is blocked by', outward: 'blocks' }, inwardIssue: { key: 'TEAM-3', fields: {} } }] },
    { issuelinks: [{ inwardIssue: { key: 'TEAM-3', fields: { status: { statusCategory: { key: 'done' } } } } }] }
  ];
  for (const changed of cases) {
    await assert.rejects(
      fetchIssue(async () => ({ ok: true, json: async () => ({ key: 'TEAM-1', fields: { ...fields, ...changed } }) }), 'TEAM-1'),
      /Jira returned an incomplete issue.*Check again/
    );
  }
});

test('a Jira link must identify one linked issue', async () => {
  const fields = {
    summary: 'Check the release', description: null, assignee: null, duedate: null, status: { statusCategory: { key: 'done' } },
    issuetype: { subtask: false }, subtasks: [], issuelinks: [], resolution: null
  };
  const type = { inward: 'is blocked by', outward: 'blocks' };
  const linked = { key: 'TEAM-3', fields: { status: { statusCategory: { key: 'done' } } } };
  for (const link of [
    { type },
    { type, inwardIssue: linked, outwardIssue: linked }
  ]) {
    await assert.rejects(
      fetchIssue(async () => ({ ok: true, json: async () => ({ key: 'TEAM-1', fields: { ...fields, issuelinks: [link] } }) }), 'TEAM-1'),
      /Jira returned an incomplete issue.*Check again/
    );
  }
});

test('complete child and linked issue statuses remain readable', async () => {
  const issue = { key: 'TEAM-1', fields: {
    summary: 'Check the release', description: null, assignee: null, duedate: null, status: { statusCategory: { key: 'done' } },
    issuetype: { subtask: false },
    subtasks: [{ key: 'TEAM-2', fields: { status: { statusCategory: { key: 'done' } } } }],
    issuelinks: [{ type: { inward: 'is blocked by', outward: 'blocks' },
      inwardIssue: { key: 'TEAM-3', fields: { status: { statusCategory: { key: 'done' } } } } }], resolution: null
  } };
  assert.equal(await fetchIssue(async () => ({ ok: true, json: async () => issue }), 'TEAM-1'), issue);
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


test('missing requested evidence fields require a retry, while empty fields remain valid', async () => {
  const fields = {
    summary: 'Check the release', description: null, assignee: null, duedate: null,
    status: { statusCategory: { key: 'done' } },
    issuetype: { subtask: false }, subtasks: [], issuelinks: [], resolution: null
  };
  for (const name of ['description', 'assignee', 'duedate', 'resolution']) {
    const incomplete = { ...fields };
    delete incomplete[name];
    await assert.rejects(
      fetchIssue(async () => ({ ok: true, json: async () => ({ key: 'TEAM-1', fields: incomplete }) }), 'TEAM-1'),
      /Jira returned an incomplete issue.*Check again/
    );
  }
  const complete = { key: 'TEAM-1', fields };
  assert.equal(await fetchIssue(async () => ({ ok: true, json: async () => complete }), 'TEAM-1'), complete);
});

test('malformed Jira resolution cannot hide cancelled work', async () => {
  const fields = {
    summary: 'Check the release', description: null, assignee: null, duedate: null,
    status: { statusCategory: { key: 'done' } },
    issuetype: { subtask: false }, subtasks: [], issuelinks: [], resolution: null
  };
  for (const resolution of [{}, { name: null }, 'Done', []]) {
    await assert.rejects(
      fetchIssue(async () => ({ ok: true, json: async () => ({ key: 'TEAM-1', fields: { ...fields, resolution } }) }), 'TEAM-1'),
      /Jira returned an incomplete issue.*Check again/
    );
  }
});
