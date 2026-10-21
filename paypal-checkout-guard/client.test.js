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

test('buyer approval is required and a later form edit keeps that order separate', async () => {
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
  let orders = 0;
  const document = {
    querySelector: element,
    createElement: tag => tag === 'li' ? { textContent: '' } : { onload: null },
    head: { append(script) { queueMicrotask(() => script.onload()); } }
  };
  const fetcher = async path => {
    if (path === '/api/config') return { ok: true, json: async () => ({ paypalReady: true, aiReady: true, clientId: 'test' }) };
    if (path === '/api/review') return { ok: true, json: async () => ({ reviewId: 'review-1', review: { summary: 'Check delivery.', questions: ['When?'], risk: 'caution' } }) };
    if (path === '/api/order') { orders++; return { ok: true, json: async () => ({ orderId: `ORDER${orders}` }) }; }
    if (path === '/api/capture') { captures++; return { ok: true, json: async () => ({ orderId: `ORDER${captures}`, captureId: `CAPTURE${captures}`, amount: '25.00' }) }; }
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
  assert.equal(await buttonOptions.createOrder(), 'ORDER1');
  assert.equal(captures, 0);
  buttonOptions.onError();
  assert.equal(await buttonOptions.createOrder(), 'ORDER1');
  assert.equal(orders, 1);
  assert.match(element('#message').textContent, /retry approval with the same PayPal button/);
  buttonOptions.onCancel();
  assert.equal(captures, 0);
  await buttonOptions.onApprove({ orderID: 'ORDER1' });
  assert.equal(captures, 1);
  assert.equal(element('#success').hidden, false);

  await handlers.get('submit')({ preventDefault() {} });
  assert.equal(await buttonOptions.createOrder(), 'ORDER2');
  handlers.get('input')();
  await buttonOptions.onApprove({ orderID: 'ORDER2' });
  assert.equal(captures, 2);
  assert.equal(element('#success').hidden, true);
  assert.match(element('#message').textContent, /Sandbox payment completed.*ORDER2.*new purchase separately/);
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

test('buyer can recover an approved sandbox order after a page reload', async () => {
  const stored = new Map();
  const sessionStorage = {
    getItem: key => stored.get(key) ?? null,
    setItem: (key, value) => stored.set(key, value),
    removeItem: key => stored.delete(key)
  };
  const source = await readFile(new URL('./client.js', import.meta.url), 'utf8');
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  let captureCalls = 0;
  const loadPage = async () => {
    const handlers = new Map();
    const elements = new Map();
    const element = selector => {
      if (!elements.has(selector)) elements.set(selector, {
        hidden: true, disabled: false, textContent: '', innerHTML: '',
        replaceChildren() {}, addEventListener(name, handler) { handlers.set(name, handler); }
      });
      return elements.get(selector);
    };
    let buttons;
    const buttonInstances = [];
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
    await new AsyncFunction('document', 'fetch', 'FormData', 'window', source)(document, fetcher, FakeFormData, {
      sessionStorage, paypal: { Buttons(options) { buttons = options; buttonInstances.push(options); return { async render() {} }; } }
    });
    return { handlers, element, get buttons() { return buttons; }, buttonInstances };
  };
  const first = await loadPage();
  await first.handlers.get('submit')({ preventDefault() {} });
  await first.buttons.onApprove({ orderID: 'ORDER123' });
  assert.equal(first.element('#retry-capture').hidden, false);
  assert.equal(stored.size, 1);

  const reloaded = await loadPage();
  assert.equal(reloaded.element('#retry-capture').hidden, false);
  await reloaded.handlers.get('submit')({ preventDefault() {} });
  await assert.rejects(reloaded.buttons.createOrder(), /Check the prior sandbox order/);
  await reloaded.handlers.get('click')();
  assert.match(reloaded.element('#message').textContent, /Sandbox payment completed.*CAPTURE123.*new purchase separately/);
  assert.equal(stored.size, 0);
  assert.equal(captureCalls, 2);
});

test('reload before the approval callback checks PayPal before any capture', async () => {
  const stored = new Map();
  const sessionStorage = {
    getItem: key => stored.get(key) ?? null,
    setItem: (key, value) => stored.set(key, value),
    removeItem: key => stored.delete(key)
  };
  const source = await readFile(new URL('./client.js', import.meta.url), 'utf8');
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  let status = 'CREATED';
  let captures = 0;
  const loadPage = async () => {
    const handlers = new Map();
    const elements = new Map();
    const element = selector => {
      if (!elements.has(selector)) elements.set(selector, {
        hidden: true, disabled: false, textContent: '', innerHTML: '',
        replaceChildren() {}, addEventListener(name, handler) { handlers.set(name, handler); }
      });
      return elements.get(selector);
    };
    let buttons;
    const buttonInstances = [];
    const document = {
      querySelector: element,
      createElement: tag => tag === 'li' ? { textContent: '' } : { onload: null },
      head: { append(script) { queueMicrotask(() => script.onload()); } }
    };
    const fetcher = async path => {
      if (path === '/api/config') return { ok: true, json: async () => ({ paypalReady: true, aiReady: true, clientId: 'test' }) };
      if (path === '/api/review') return { ok: true, json: async () => ({ reviewId: 'review-1', review: { summary: 'Check terms.', questions: ['When?'], risk: 'review' } }) };
      if (path === '/api/order') return { ok: true, json: async () => ({ orderId: 'ORDER123' }) };
      if (path === '/api/status') return { ok: true, json: async () => ({ status }) };
      if (path === '/api/capture') { captures++; return { ok: true, json: async () => ({ orderId: 'ORDER123', captureId: 'CAPTURE123', amount: '25.00' }) }; }
      throw new Error(`Unexpected request: ${path}`);
    };
    class FakeFormData { *[Symbol.iterator]() { yield ['item', 'Logo']; yield ['amount', '25.00']; yield ['description', 'A logo draft arrives tomorrow.']; } }
    await new AsyncFunction('document', 'fetch', 'FormData', 'window', source)(document, fetcher, FakeFormData, {
      sessionStorage, paypal: { Buttons(options) { buttons = options; buttonInstances.push(options); return { async render() {} }; } }
    });
    return { handlers, element, get buttons() { return buttons; }, buttonInstances };
  };
  const first = await loadPage();
  await first.handlers.get('submit')({ preventDefault() {} });
  assert.equal(await first.buttons.createOrder(), 'ORDER123');
  assert.equal(stored.size, 1);
  const reloaded = await loadPage();
  assert.equal(reloaded.element('#retry-capture').hidden, false);
  assert.equal(reloaded.element('#approval-recovery').hidden, false);
  const resumeApproval = reloaded.buttonInstances[0];
  assert.equal(await resumeApproval.createOrder(), 'ORDER123');
  await reloaded.handlers.get('click')();
  assert.equal(captures, 0);
  assert.equal(stored.size, 1);
  assert.match(reloaded.element('#message').textContent, /still awaits buyer approval/);

  await reloaded.handlers.get('submit')({ preventDefault() {} });
  await assert.rejects(reloaded.buttons.createOrder(), /Check the prior sandbox order/);
  status = 'APPROVED';
  await resumeApproval.onApprove({ orderID: 'ORDER123' });
  assert.equal(captures, 1);
  assert.equal(stored.size, 0);
  assert.equal(reloaded.element('#approval-recovery').hidden, true);
  assert.match(reloaded.element('#message').textContent, /Sandbox payment completed.*CAPTURE123.*new purchase separately/);
});
