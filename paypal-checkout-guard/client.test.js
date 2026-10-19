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

test('buyer approval is required before capture and a changed purchase blocks it', async () => {
  const handlers = new Map();
  const elements = new Map();
  const element = selector => {
    if (!elements.has(selector)) elements.set(selector, {
      hidden: false, disabled: false, textContent: '', innerHTML: '',
      replaceChildren() {}, addEventListener(name, handler) { handlers.set(name, handler); }
    });
    return elements.get(selector);
  };
  let buttonOptions;
  let captures = 0;
  const document = {
    querySelector: element,
    createElement: tag => tag === 'li' ? { textContent: '' } : { onload: null },
    head: { append(script) { queueMicrotask(() => script.onload()); } }
  };
  const fetcher = async path => {
    if (path === '/api/config') return { ok: true, json: async () => ({ paypalReady: true, aiReady: true, clientId: 'test' }) };
    if (path === '/api/review') return { ok: true, json: async () => ({ reviewId: 'review-1', review: { summary: 'Check delivery.', questions: ['When?'], risk: 'caution' } }) };
    if (path === '/api/order') return { ok: true, json: async () => ({ orderId: 'ORDER123' }) };
    if (path === '/api/capture') { captures++; return { ok: true, json: async () => ({ orderId: 'ORDER123', captureId: 'CAPTURE123', amount: '25.00' }) }; }
    throw new Error(`Unexpected request: ${path}`);
  };
  class FakeFormData { *[Symbol.iterator]() { yield ['item', 'Logo']; yield ['amount', '25.00']; yield ['description', 'A logo draft arrives tomorrow.']; } }
  const source = await readFile(new URL('./client.js', import.meta.url), 'utf8');
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  await new AsyncFunction('document', 'fetch', 'FormData', 'window', source)(document, fetcher, FakeFormData, {
    paypal: { Buttons(options) { buttonOptions = options; return { async render() {} }; } }
  });
  await handlers.get('submit')({ preventDefault() {} });
  assert.equal(element('#review-risk').textContent, 'AI review · use caution');
  assert.equal(captures, 0);
  assert.equal(await buttonOptions.createOrder(), 'ORDER123');
  assert.equal(captures, 0);
  buttonOptions.onCancel();
  assert.equal(captures, 0);
  await buttonOptions.onApprove({ orderID: 'ORDER123' });
  assert.equal(captures, 1);
  assert.equal(element('#success').hidden, false);

  await handlers.get('submit')({ preventDefault() {} });
  handlers.get('input')();
  await buttonOptions.onApprove({ orderID: 'ORDER123' });
  assert.equal(captures, 1);
  assert.match(element('#message').textContent, /Purchase changed/);
});

test('editing while PayPal buttons render removes the stale checkout', async () => {
  const handlers = new Map();
  const elements = new Map();
  const element = selector => {
    if (!elements.has(selector)) elements.set(selector, {
      hidden: false, disabled: false, textContent: '', innerHTML: '', children: [],
      replaceChildren(...children) { this.children = children; },
      addEventListener(name, handler) { handlers.set(name, handler); }
    });
    return elements.get(selector);
  };
  let finishRender;
  const document = {
    querySelector: element,
    createElement: tag => tag === 'li' ? { textContent: '' } : { onload: null },
    head: { append(script) { queueMicrotask(() => script.onload()); } }
  };
  const fetcher = async path => path === '/api/config'
    ? { ok: true, json: async () => ({ paypalReady: true, aiReady: true, clientId: 'test' }) }
    : { ok: true, json: async () => ({ reviewId: 'review-1', review: { summary: 'Check terms.', questions: [], risk: 'review' } }) };
  class FakeFormData { *[Symbol.iterator]() { yield ['item', 'Logo']; yield ['amount', '25.00']; yield ['description', 'A logo draft arrives tomorrow.']; } }
  const source = await readFile(new URL('./client.js', import.meta.url), 'utf8');
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  await new AsyncFunction('document', 'fetch', 'FormData', 'window', source)(document, fetcher, FakeFormData, {
    paypal: { Buttons() { return { render() { return new Promise(resolve => {
      finishRender = () => { element('#paypal-button-container').children = ['stale button']; resolve(); };
    }); } }; } }
  });
  const submit = handlers.get('submit')({ preventDefault() {} });
  while (!finishRender) await new Promise(resolve => setImmediate(resolve));
  handlers.get('input')();
  finishRender();
  await submit;
  assert.deepEqual(element('#paypal-button-container').children, []);
  assert.equal(element('#review-result').hidden, true);
});

test('buyer can check the same order after a lost capture reply', async () => {
  const handlers = new Map();
  const elements = new Map();
  const element = selector => {
    if (!elements.has(selector)) elements.set(selector, {
      hidden: true, disabled: false, textContent: '', innerHTML: '',
      replaceChildren() {}, addEventListener(name, handler) { handlers.set(name, handler); }
    });
    return elements.get(selector);
  };
  let buttonOptions;
  let captureCalls = 0;
  const document = {
    querySelector: element,
    createElement: tag => tag === 'li' ? { textContent: '' } : { onload: null },
    head: { append(script) { queueMicrotask(() => script.onload()); } }
  };
  const fetcher = async path => {
    if (path === '/api/config') return { ok: true, json: async () => ({ paypalReady: true, aiReady: true, clientId: 'test' }) };
    if (path === '/api/review') return { ok: true, json: async () => ({ reviewId: 'review-1', review: { summary: 'Check terms.', questions: ['When?'], risk: 'review' } }) };
    if (path === '/api/capture') {
      captureCalls++;
      if (captureCalls === 1) throw new Error('Network reply lost');
      return { ok: true, json: async () => ({ orderId: 'ORDER123', captureId: 'CAPTURE123', amount: '25.00' }) };
    }
    throw new Error(`Unexpected request: ${path}`);
  };
  class FakeFormData { *[Symbol.iterator]() { yield ['item', 'Logo']; yield ['amount', '25.00']; yield ['description', 'A logo draft arrives tomorrow.']; } }
  const source = await readFile(new URL('./client.js', import.meta.url), 'utf8');
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  await new AsyncFunction('document', 'fetch', 'FormData', 'window', source)(document, fetcher, FakeFormData, {
    paypal: { Buttons(options) { buttonOptions = options; return { async render() {} }; } }
  });
  await handlers.get('submit')({ preventDefault() {} });
  await buttonOptions.onApprove({ orderID: 'ORDER123' });
  assert.equal(element('#retry-capture').hidden, false);
  assert.equal(element('#success').hidden, true);
  handlers.get('input')();
  assert.equal(element('#retry-capture').hidden, false);
  await handlers.get('submit')({ preventDefault() {} });
  await assert.rejects(buttonOptions.createOrder(), /Check the prior sandbox order/);
  await handlers.get('click')();
  assert.equal(element('#retry-capture').hidden, true);
  assert.equal(element('#success').hidden, true);
  assert.match(element('#message').textContent, /Sandbox payment completed.*CAPTURE123.*new purchase separately/);
  assert.equal(captureCalls, 2);
});
