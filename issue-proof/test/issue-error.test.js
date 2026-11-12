import test from 'node:test';
import assert from 'node:assert/strict';
import { issueFetchError } from '../src/issue-error.js';

test('gives a clear next step for Jira permission, missing issue, and rate limits', () => {
  assert.match(issueFetchError(403), /project admin.*issue access/);
  assert.match(issueFetchError(404), /moved or you may not have access/);
  assert.match(issueFetchError(429), /Wait a moment/);
  assert.match(issueFetchError(500), /Jira returned 500/);
});
