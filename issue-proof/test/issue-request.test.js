import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchIssue } from '../src/issue-request.js';
import { assessIssue } from '../src/checks.js';

test('returns a Jira issue and safely encodes its key', async () => {
  let path;
  const issue = { key: 'TEAM-1/extra', fields: {
    summary: 'Check the release', description: null, assignee: null, duedate: null, status: { name: 'In Progress', statusCategory: { key: 'indeterminate' } },
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

test('a parent edit blocks handoff even without subtasks or blockers', async () => {
  const issue = { key: 'TEAM-1', fields: {
    summary: 'Check the release', description: null, assignee: null, duedate: null,
    status: { name: 'Done', statusCategory: { key: 'done' } },
    issuetype: { subtask: false }, subtasks: [], issuelinks: [], resolution: { name: 'Fixed' }
  } };
  let reads = 0;
  await assert.rejects(fetchIssue(async () => ({
    ok: true,
    json: async () => ++reads === 1 ? issue : {
      ...issue, fields: { ...issue.fields, duedate: '2026-11-22' }
    }
  }), 'TEAM-1'), /main Jira issue changed during this check/);
  assert.equal(reads, 2);
});

test('reordered unchanged Jira relationships do not block handoff', async () => {
  const child = (id, key) => ({ id, key, fields: { status: {
    name: 'Done', statusCategory: { key: 'done' }
  } } });
  const base = { key: 'TEAM-1', fields: {
    summary: 'Check the release', description: null, assignee: null, duedate: null,
    status: { name: 'Done', statusCategory: { key: 'done' } },
    issuetype: { subtask: false }, subtasks: [child('2', 'TEAM-2'), child('3', 'TEAM-3')],
    issuelinks: [], resolution: { name: 'Fixed' }
  } };
  let parentReads = 0;
  const result = await fetchIssue(async (path) => {
    if (path.includes('/issue/TEAM-1?')) {
      parentReads += 1;
      return { ok: true, json: async () => parentReads === 1 ? base : {
        ...base, fields: { ...base.fields, subtasks: [...base.fields.subtasks].reverse() }
      } };
    }
    const key = path.includes('TEAM-2') ? 'TEAM-2' : 'TEAM-3';
    return { ok: true, json: async () => ({
      id: key === 'TEAM-2' ? '2' : '3', key,
      fields: { status: { name: 'Done', statusCategory: { key: 'done' } }, resolution: { name: 'Fixed' } }
    }) };
  }, 'TEAM-1');
  assert.equal(result.key, 'TEAM-1');
  assert.equal(parentReads, 2);
});

test('a key lookup cannot show evidence from another issue', async () => {
  const issue = { key: 'OTHER-2', fields: {
    summary: 'Other work', description: null, assignee: null, duedate: null,
    status: { name: 'Done', statusCategory: { key: 'done' } }, issuetype: { subtask: false },
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
    summary: 'Check the release', description: null, assignee: null, duedate: null, status: { name: 'Done', statusCategory: { key: 'done' } },
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
    status: { name: 'Done', statusCategory: { key: 'done' } }, issuetype: { subtask: false },
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
    status: { name: 'Done', statusCategory: { key: 'done' } }, issuetype: { subtask: false },
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
    { key: 'TEAM-1', fields: { summary: 'Check the release', description: null, assignee: null, duedate: null, status: { name: 'Done', statusCategory: { key: 'done' } } } }
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
    status: { name: 'Done', statusCategory: { key: 'done' } }, issuetype: { subtask: false },
    subtasks: [], issuelinks: [], resolution: null
  };
  for (const changed of [
    { description: [] }, { description: { type: 'doc' } },
    { assignee: 'account-123' }, { assignee: {} },
    { assignee: { accountId: 'account-123' } },
    { assignee: { accountId: 'account-123', active: 'false' } },
    { assignee: { accountId: '   ', active: true } },
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
    status: { name: 'Done', statusCategory: { key: 'done' } }, issuetype: { subtask: false },
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
    summary: 'Check the release', description: null, assignee: null, duedate: null, status: { name: 'Done', statusCategory: { key: 'done' } },
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
    summary: 'Check the release', description: null, assignee: null, duedate: null, status: { name: 'Done', statusCategory: { key: 'done' } },
    issuetype: { subtask: false }, subtasks: [], issuelinks: [], resolution: null
  };
  const cases = [
    { subtasks: [{ id: '10002', key: 'TEAM-2', fields: {} }] },
    { subtasks: [{ fields: { status: { name: 'Done', statusCategory: { key: 'done' } } } }] },
    { issuelinks: [{ type: { inward: 'is blocked by', outward: 'blocks' }, inwardIssue: { id: '10003', key: 'TEAM-3', fields: {} } }] },
    { issuelinks: [{ inwardIssue: { id: '10003', key: 'TEAM-3', fields: { status: { name: 'Done', statusCategory: { key: 'done' } } } } }] }
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
    summary: 'Check the release', description: null, assignee: null, duedate: null, status: { name: 'Done', statusCategory: { key: 'done' } },
    issuetype: { subtask: false }, subtasks: [], issuelinks: [], resolution: null
  };
  const type = { inward: 'is blocked by', outward: 'blocks' };
  const linked = { id: '10003', key: 'TEAM-3', fields: { status: { name: 'Done', statusCategory: { key: 'done' } } } };
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
    summary: 'Check the release', description: null, assignee: null, duedate: null, status: { name: 'Done', statusCategory: { key: 'done' } },
    issuetype: { subtask: false },
    subtasks: [{ id: '10002', key: 'TEAM-2', fields: { status: { name: 'Done', statusCategory: { key: 'done' } } } }],
    issuelinks: [{ type: { inward: 'is blocked by', outward: 'blocks' },
      inwardIssue: { id: '10003', key: 'TEAM-3', fields: { status: { name: 'Done', statusCategory: { key: 'done' } } } } }], resolution: null
  } };
  const requested = [];
  const result = await fetchIssue(async (path) => {
    requested.push(path);
    const key = path.match(/\/issue\/([^?]+)/)[1];
    return { ok: true, json: async () => key === 'TEAM-1' ? issue : {
      id: `1000${key.split('-')[1]}`, key, fields: { status: { name: 'Done', statusCategory: { key: 'done' } }, resolution: { name: 'Fixed' } }
    } };
  }, 'TEAM-1');
  assert.equal(result, issue);
  assert.equal(requested.length, 6);
  assert.equal(result.fields.subtasks[0].fields.resolution.name, 'Fixed');
  assert.equal(result.fields.issuelinks[0].inwardIssue.fields.resolution.name, 'Fixed');
});

test('related Jira reads stay within a four-request burst', async () => {
  const status = { name: 'Done', statusCategory: { key: 'done' } };
  const issue = { key: 'TEAM-1', fields: {
    summary: 'Release checkout', description: null, assignee: null, duedate: null,
    status, resolution: { name: 'Fixed' }, issuetype: { subtask: false }, issuelinks: [],
    subtasks: Array.from({ length: 9 }, (_, index) => ({
      key: `TEAM-${index + 2}`, fields: { status }
    }))
  } };
  let active = 0;
  let peak = 0;
  let relatedReads = 0;
  const result = await fetchIssue(async (path) => {
    if (path.includes('TEAM-1?')) return { ok: true, json: async () => issue };
    active += 1;
    peak = Math.max(peak, active);
    relatedReads += 1;
    await new Promise((resolve) => setTimeout(resolve, 1));
    active -= 1;
    const key = path.match(/\/issue\/([^?]+)/)[1];
    return { ok: true, json: async () => ({ id: `1000${key.split('-')[1]}`, key, fields: { status, resolution: { name: 'Fixed' } } }) };
  }, 'TEAM-1');
  assert.equal(result, issue);
  assert.equal(relatedReads, 18);
  assert.equal(peak, 4);
});

test('a green related status cannot hide unresolved or mismatched work', async () => {
  const issue = { key: 'TEAM-1', fields: {
    summary: 'Release checkout', description: null, assignee: null, duedate: null,
    status: { name: 'Done', statusCategory: { key: 'done' } }, resolution: { name: 'Fixed' },
    issuetype: { subtask: false }, issuelinks: [],
    subtasks: [{ id: '10002', key: 'TEAM-2', fields: { status: { name: 'Done', statusCategory: { key: 'done' } } } }]
  } };
  const request = async (path) => ({ ok: true, json: async () => path.includes('TEAM-1') ? issue : {
    id: '10002', key: 'TEAM-2', fields: { status: { name: 'Done', statusCategory: { key: 'done' } }, resolution: null }
  } });
  const result = await fetchIssue(request, 'TEAM-1');
  assert.equal(result.fields.subtasks[0].fields.resolution, null);
  const report = assessIssue(result, '2026-11-20');
  assert.equal(report.checks.find((check) => check.id === 'subtasks').passed, false);
  delete issue.fields.subtasks[0].fields.resolution;
  await assert.rejects(fetchIssue(async (path) => ({ ok: true, json: async () => path.includes('TEAM-1') ? issue : {
    key: 'OTHER-2', fields: { status: { name: 'Done', statusCategory: { key: 'done' } }, resolution: { name: 'Fixed' } }
  } }), 'TEAM-1'), /incomplete related work/);
});

test('a linked issue must keep its Jira ID across the direct read', async () => {
  const status = { name: 'Done', statusCategory: { key: 'done' } };
  const issue = { key: 'TEAM-1', fields: {
    summary: 'Release checkout', description: null, assignee: null, duedate: null,
    status, resolution: { name: 'Fixed' }, issuetype: { subtask: false },
    subtasks: [{ id: '10002', key: 'TEAM-2', fields: { status } }], issuelinks: []
  } };
  const request = async (path) => ({ ok: true, json: async () => path.includes('TEAM-1') ? issue : {
    id: '10003', key: 'TEAM-2', fields: { status, resolution: { name: 'Fixed' } }
  } });
  await assert.rejects(fetchIssue(request, 'TEAM-1'), /incomplete related work/);
});

test('a related Jira reply without an ID cannot pass handoff', async () => {
  const status = { name: 'Done', statusCategory: { key: 'done' } };
  const issue = { key: 'TEAM-1', fields: {
    summary: 'Release checkout', description: null, assignee: null, duedate: null,
    status, resolution: { name: 'Fixed' }, issuetype: { subtask: false },
    subtasks: [{ key: 'TEAM-2', fields: { status } }], issuelinks: []
  } };
  await assert.rejects(fetchIssue(async (path) => ({ ok: true, json: async () =>
    path.includes('TEAM-2')
      ? { key: 'TEAM-2', fields: { status, resolution: { name: 'Fixed' } } }
      : issue
  }), 'TEAM-1'), /incomplete related work/);
});

test('incomplete linked Jira replies give a retry step', async () => {
  const status = { name: 'Done', statusCategory: { key: 'done' } };
  const issue = { key: 'TEAM-1', fields: {
    summary: 'Release checkout', description: null, assignee: null, duedate: null,
    status, resolution: { name: 'Fixed' }, issuetype: { subtask: false },
    subtasks: [{ id: '10002', key: 'TEAM-2', fields: { status } }], issuelinks: []
  } };
  for (const detail of [{ key: 'TEAM-2' }, { id: '10002', key: 'TEAM-2', fields: null }]) {
    await assert.rejects(fetchIssue(async (path) => ({ ok: true, json: async () =>
      path.includes('TEAM-2') ? detail : issue
    }), 'TEAM-1'), /incomplete related work.*try again/);
  }
});

test('blank related Jira keys cannot enter the handoff check', async () => {
  const status = { name: 'Done', statusCategory: { key: 'done' } };
  const issue = { key: 'TEAM-1', fields: {
    summary: 'Release checkout', description: null, assignee: null, duedate: null,
    status, resolution: { name: 'Fixed' }, issuetype: { subtask: false },
    subtasks: [{ key: '  ', fields: { status } }], issuelinks: []
  } };
  await assert.rejects(fetchIssue(async () => ({ ok: true, json: async () => issue }), 'TEAM-1'),
    /incomplete issue.*Check again/);
});

test('conflicting embedded IDs block a related issue before handoff', async () => {
  const status = { name: 'Done', statusCategory: { key: 'done' } };
  const issue = { key: 'TEAM-1', fields: {
    summary: 'Release checkout', description: null, assignee: null, duedate: null,
    status, resolution: { name: 'Fixed' }, issuetype: { subtask: false },
    subtasks: [{ id: '10002', key: 'TEAM-2', fields: { status } }],
    issuelinks: [{ type: { inward: 'is blocked by', outward: 'blocks' },
      inwardIssue: { id: '10003', key: 'TEAM-2', fields: { status } } }]
  } };
  await assert.rejects(fetchIssue(async () => ({ ok: true, json: async () => issue }), 'TEAM-1'), /conflicting related issues/);
});

test('embedded related resolution cannot hide a later unresolved Jira issue', async () => {
  const issue = { key: 'TEAM-1', fields: {
    summary: 'Release checkout', description: null, assignee: null, duedate: null,
    status: { name: 'Done', statusCategory: { key: 'done' } }, resolution: { name: 'Fixed' },
    issuetype: { subtask: false }, issuelinks: [],
    subtasks: [{ id: '10002', key: 'TEAM-2', fields: {
      status: { name: 'Done', statusCategory: { key: 'done' } }, resolution: { name: 'Fixed' }
    } }]
  } };
  const requested = [];
  const result = await fetchIssue(async (path) => {
    requested.push(path);
    return { ok: true, json: async () => path.includes('TEAM-1') ? issue : {
      id: '10002', key: 'TEAM-2', fields: {
        status: { name: 'In Progress', statusCategory: { key: 'indeterminate' } }, resolution: null
      }
    } };
  }, 'TEAM-1');
  assert.equal(requested.length, 4);
  assert.equal(result.fields.subtasks[0].fields.resolution, null);
  assert.equal(assessIssue(result, '2026-11-20').checks.find((check) => check.id === 'subtasks').passed, false);
});

test('fresh related status can clear an embedded stale blocker', async () => {
  const issue = { key: 'TEAM-1', fields: {
    summary: 'Release checkout', description: null, assignee: null, duedate: null,
    status: { name: 'Done', statusCategory: { key: 'done' } }, resolution: { name: 'Fixed' },
    issuetype: { subtask: false }, subtasks: [],
    issuelinks: [{ type: { inward: 'is blocked by', outward: 'blocks' },
      inwardIssue: { id: '10002', key: 'TEAM-2', fields: {
        status: { name: 'In Progress', statusCategory: { key: 'indeterminate' } }
      } } }]
  } };
  const requests = [];
  const result = await fetchIssue(async (path) => {
    requests.push(path);
    return { ok: true, json: async () => path.includes('TEAM-2') ? {
      id: '10002', key: 'TEAM-2', fields: {
        status: { name: 'Done', statusCategory: { key: 'done' } }, resolution: { name: 'Fixed' }
      }
    } : issue };
  }, 'TEAM-1');
  assert.equal(requests.length, 4);
  const blocker = assessIssue(result, '2026-11-20').checks.find((check) => check.id === 'blockers');
  assert.equal(blocker.passed, true);
  assert.match(blocker.detail, /TEAM-2/);
});

test('a changed main issue during related reads requires a fresh handoff check', async () => {
  const issue = { key: 'TEAM-1', fields: {
    summary: 'Release checkout', description: null, assignee: null, duedate: '2026-11-20',
    status: { name: 'Done', statusCategory: { key: 'done' } }, resolution: { name: 'Fixed' },
    issuetype: { subtask: false }, issuelinks: [],
    subtasks: [{ id: '10002', key: 'TEAM-2', fields: { status: { name: 'Done', statusCategory: { key: 'done' } } } }]
  } };
  let parentReads = 0;
  await assert.rejects(fetchIssue(async (path) => ({ ok: true, json: async () => {
    if (path.includes('TEAM-2')) return { id: '10002', key: 'TEAM-2', fields: {
      status: { name: 'Done', statusCategory: { key: 'done' } }, resolution: { name: 'Fixed' }
    } };
    parentReads += 1;
    return parentReads === 1 ? issue : { ...issue, fields: { ...issue.fields, duedate: null } };
  } }), 'TEAM-1'), /main Jira issue changed during this check/);
  assert.equal(parentReads, 2);
});

test('Jira field order changes do not falsely block an unchanged handoff', async () => {
  const status = { name: 'Done', statusCategory: { key: 'done' } };
  const relatedFields = { status, resolution: { name: 'Fixed' } };
  const issue = { key: 'TEAM-1', fields: {
    summary: 'Release checkout', description: null, assignee: null, duedate: null,
    status, resolution: { name: 'Fixed' }, issuetype: { subtask: false },
    subtasks: [{ id: '10002', key: 'TEAM-2', fields: { status } }], issuelinks: []
  } };
  let parentReads = 0;
  let relatedReads = 0;
  const result = await fetchIssue(async (path) => ({ ok: true, json: async () => {
    if (path.includes('TEAM-2')) {
      relatedReads += 1;
      return { id: '10002', key: 'TEAM-2', fields: relatedReads === 1
        ? relatedFields : { resolution: { name: 'Fixed' }, status: { statusCategory: { key: 'done' }, name: 'Done' } } };
    }
    parentReads += 1;
    return parentReads === 1 ? issue : {
      fields: { ...issue.fields, status: { statusCategory: { key: 'done' }, name: 'Done' } }, key: 'TEAM-1'
    };
  } }), 'TEAM-1');
  assert.equal(result.key, 'TEAM-1');
  assert.equal(parentReads, 2);
  assert.equal(relatedReads, 2);
});

test('a parent edit during the second related read blocks handoff', async () => {
  const issue = { key: 'TEAM-1', fields: {
    summary: 'Release checkout', description: null, assignee: null, duedate: '2026-11-20',
    status: { name: 'Done', statusCategory: { key: 'done' } }, resolution: { name: 'Fixed' },
    issuetype: { subtask: false }, issuelinks: [],
    subtasks: [{ id: '10002', key: 'TEAM-2', fields: { status: { name: 'Done', statusCategory: { key: 'done' } } } }]
  } };
  let relatedReads = 0;
  await assert.rejects(fetchIssue(async (path) => ({ ok: true, json: async () => {
    if (path.includes('TEAM-2')) {
      relatedReads += 1;
      return { id: '10002', key: 'TEAM-2', fields: {
        status: { name: 'Done', statusCategory: { key: 'done' } }, resolution: { name: 'Fixed' }
      } };
    }
    return relatedReads < 2 ? issue : { ...issue, fields: { ...issue.fields, duedate: null } };
  } }), 'TEAM-1'), /main Jira issue changed during this check/);
  assert.equal(relatedReads, 2);
});

test('a linked issue changed during the main issue recheck cannot pass handoff', async () => {
  const issue = { key: 'TEAM-1', fields: {
    summary: 'Release checkout', description: null, assignee: null, duedate: null,
    status: { name: 'Done', statusCategory: { key: 'done' } }, resolution: { name: 'Fixed' },
    issuetype: { subtask: false }, issuelinks: [],
    subtasks: [{ id: '10002', key: 'TEAM-2', fields: { status: { name: 'Done', statusCategory: { key: 'done' } } } }]
  } };
  let relatedReads = 0;
  await assert.rejects(fetchIssue(async (path) => ({ ok: true, json: async () => {
    if (!path.includes('TEAM-2')) return issue;
    relatedReads += 1;
    return { id: '10002', key: 'TEAM-2', fields: relatedReads === 1
      ? { status: { name: 'Done', statusCategory: { key: 'done' } }, resolution: { name: 'Fixed' } }
      : { status: { name: 'In Progress', statusCategory: { key: 'indeterminate' } }, resolution: null } };
  } }), 'TEAM-1'), /Related Jira work changed during this check/);
  assert.equal(relatedReads, 2);
});

test('a related issue ID change cannot pass with unchanged status and resolution', async () => {
  const status = { name: 'Done', statusCategory: { key: 'done' } };
  const issue = { key: 'TEAM-1', fields: {
    summary: 'Release checkout', description: null, assignee: null, duedate: null,
    status, resolution: { name: 'Fixed' }, issuetype: { subtask: false }, issuelinks: [],
    subtasks: [{ key: 'TEAM-2', fields: { status } }]
  } };
  let relatedReads = 0;
  await assert.rejects(fetchIssue(async (path) => ({ ok: true, json: async () => {
    if (!path.includes('TEAM-2')) return issue;
    return { id: ++relatedReads === 1 ? '10002' : '10003', key: 'TEAM-2',
      fields: { status, resolution: { name: 'Fixed' } } };
  } }), 'TEAM-1'), /Related Jira work changed during this check/);
  assert.equal(relatedReads, 2);
});

test('missing Jira status names cannot hide cancelled child or linked work', async () => {
  const status = { name: 'Done', statusCategory: { key: 'done' } };
  const fields = {
    summary: 'Check the release', description: null, assignee: null, duedate: null,
    status, issuetype: { subtask: false }, resolution: null,
    subtasks: [{ id: '10002', key: 'TEAM-2', fields: { status } }],
    issuelinks: [{ type: { inward: 'is blocked by', outward: 'blocks' },
      inwardIssue: { id: '10003', key: 'TEAM-3', fields: { status } } }]
  };
  for (const changed of [
    { ...fields, status: { statusCategory: { key: 'done' } } },
    { ...fields, subtasks: [{ id: '10002', key: 'TEAM-2', fields: { status: { statusCategory: { key: 'done' } } } }] },
    { ...fields, issuelinks: [{ ...fields.issuelinks[0], inwardIssue: {
      id: '10003', key: 'TEAM-3', fields: { status: { statusCategory: { key: 'done' } } }
    } }] }
  ]) {
    await assert.rejects(
      fetchIssue(async () => ({ ok: true, json: async () => ({ key: 'TEAM-1', fields: changed }) }), 'TEAM-1'),
      /Jira returned an incomplete issue.*Check again/
    );
  }
});

test('blank Jira status and resolution values cannot appear as completed evidence', async () => {
  const status = { name: 'Done', statusCategory: { key: 'done' } };
  const fields = {
    summary: 'Check the release', description: null, assignee: null, duedate: null,
    status, issuetype: { subtask: false }, resolution: { name: 'Fixed' },
    subtasks: [], issuelinks: []
  };
  for (const changed of [
    { ...fields, status: { ...status, name: '  ' } },
    { ...fields, status: { ...status, statusCategory: { key: ' ' } } },
    { ...fields, resolution: { name: ' ' } }
  ]) {
    await assert.rejects(fetchIssue(async () => ({ ok: true, json: async () => ({
      key: 'TEAM-1', fields: changed
    }) }), 'TEAM-1'), /Jira returned an incomplete issue/);
  }
  const parent = { key: 'TEAM-1', fields: { ...fields,
    subtasks: [{ id: '10002', key: 'TEAM-2', fields: { status } }]
  } };
  for (const relatedFields of [
    { status: { ...status, name: ' ' }, resolution: { name: 'Fixed' } },
    { status, resolution: { name: ' ' } }
  ]) {
    await assert.rejects(fetchIssue(async (path) => ({ ok: true, json: async () =>
      path.includes('TEAM-2') ? { id: '10002', key: 'TEAM-2', fields: relatedFields } : parent
    }), 'TEAM-1'), /Jira returned incomplete related work/);
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

test('related work rate limits and lost sign-in give the right recovery step', async () => {
  const issue = { key: 'TEAM-1', fields: {
    summary: 'Release checkout', description: null, assignee: null, duedate: null,
    status: { name: 'Done', statusCategory: { key: 'done' } }, resolution: { name: 'Fixed' },
    issuetype: { subtask: false }, issuelinks: [],
    subtasks: [{ id: '10002', key: 'TEAM-2', fields: { status: { name: 'Done', statusCategory: { key: 'done' } } } }]
  } };
  await assert.rejects(fetchIssue(async (path) => path.includes('TEAM-2')
    ? { ok: false, status: 429 }
    : { ok: true, json: async () => issue }, 'TEAM-1'), /limiting requests.*Wait a moment/);
  let mainReads = 0;
  await assert.rejects(fetchIssue(async (path) => {
    if (path.includes('TEAM-2')) return { ok: true, json: async () => ({ id: '10002', key: 'TEAM-2', fields: {
      status: { name: 'Done', statusCategory: { key: 'done' } }, resolution: { name: 'Fixed' }
    } }) };
    mainReads += 1;
    return mainReads === 1 ? { ok: true, json: async () => issue } : { ok: false, status: 401 };
  }, 'TEAM-1'), /sign-in expired.*Sign in again/);
});


test('missing requested evidence fields require a retry, while empty fields remain valid', async () => {
  const fields = {
    summary: 'Check the release', description: null, assignee: null, duedate: null,
    status: { name: 'Done', statusCategory: { key: 'done' } },
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
    status: { name: 'Done', statusCategory: { key: 'done' } },
    issuetype: { subtask: false }, subtasks: [], issuelinks: [], resolution: null
  };
  for (const resolution of [{}, { name: null }, 'Done', []]) {
    await assert.rejects(
      fetchIssue(async () => ({ ok: true, json: async () => ({ key: 'TEAM-1', fields: { ...fields, resolution } }) }), 'TEAM-1'),
      /Jira returned an incomplete issue.*Check again/
    );
  }
});
