import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('editing during an AI response does not restore stale PayPal approval', async () => {
  const handlers = new Map();
  const elements = new Map();
  const element = selector => {
    if (!elements.has(selector)) elements.set(selector, {
      hidden: false, disabled: false, textContent: '', innerHTML: '',
      replaceChildren() {}, addEventListener(name, handler) { handlers.set(name, handler); }
    });
    return elements.get(selector);
  };
  let completeReview;
  let scripts = 0;
  const document = {
    querySelector: element,
    createElement: () => ({}),
    head: { append() { scripts++; } }
  };
  const fetcher = async path => path === '/api/config'
    ? { json: async () => ({ paypalReady: true, aiReady: true, clientId: 'test' }) }
    : new Promise(resolve => { completeReview = () => resolve({ ok: true, json: async () => ({ reviewId: 'stale-review', review: { summary: 'Old terms', questions: [] } }) }); });
  class FakeFormData { *[Symbol.iterator]() { yield ['item', 'Logo']; yield ['amount', '25.00']; yield ['description', 'A logo draft arrives tomorrow.']; } }
  const source = await readFile(new URL('./client.js', import.meta.url), 'utf8');
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  await new AsyncFunction('document', 'fetch', 'FormData', 'window', source)(document, fetcher, FakeFormData, {});
  const submitted = handlers.get('submit')({ preventDefault() {} });
  handlers.get('input')();
  completeReview();
  await submitted;
  assert.equal(element('#review-result').hidden, true);
  assert.equal(element('#success').hidden, true);
  assert.equal(scripts, 0);
});
