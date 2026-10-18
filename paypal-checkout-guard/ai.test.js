import test from 'node:test';
import assert from 'node:assert/strict';
import { AIReview } from './ai.js';

test('AI review uses structured output and no provider storage', async () => {
  let request;
  const ai = new AIReview({ apiKey: 'test-key', fetcher: async (url, options) => {
    request = { url, options };
    return { ok: true, json: async () => ({ status: 'completed', output: [{ content: [{ type: 'output_text', text: JSON.stringify({ summary: 'A design milestone.', questions: ['When is delivery due?'], risk: 'review' }) }] }] }) };
  } });
  const review = await ai.review({ item: 'Logo milestone', amount: '25.00', description: 'A logo draft will be delivered tomorrow.' });
  assert.equal(review.questions[0], 'When is delivery due?');
  assert.equal(request.url, 'https://api.openai.com/v1/responses');
  assert.equal(JSON.parse(request.options.body).store, false);
  assert.equal(JSON.parse(request.options.body).text.format.type, 'json_schema');
});

test('AI provider failure cannot produce an invented review', async () => {
  const ai = new AIReview({ apiKey: 'test-key', fetcher: async () => ({ ok: false, json: async () => ({ error: 'private' }) }) });
  await assert.rejects(ai.review({ item: 'Logo milestone', amount: '25.00', description: 'A logo draft will be delivered tomorrow.' }), /^Error: AI review request failed$/);
});

test('an incomplete or empty AI answer cannot unlock checkout', async () => {
  const input = { item: 'Logo milestone', amount: '25.00', description: 'A logo draft will be delivered tomorrow.' };
  for (const result of [
    { status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' }, output: [{ content: [{ type: 'output_text', text: '{"summary":"Fine","questions":["Pay?"],"risk":"review"}' }] }] },
    { status: 'completed', output: [{ content: [{ type: 'refusal', refusal: 'Cannot review' }] }] },
    { status: 'completed', output: [{ content: [{ type: 'output_text', text: '{"summary":" ","questions":[],"risk":"review"}' }] }] }
  ]) {
    const ai = new AIReview({ apiKey: 'test-key', fetcher: async () => ({ ok: true, json: async () => result }) });
    await assert.rejects(ai.review(input));
  }
});
