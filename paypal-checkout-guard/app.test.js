import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from './app.js';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function withServer(app, run) {
  await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
  try { await run(`http://127.0.0.1:${app.address().port}`); }
  finally { await new Promise(resolve => app.close(resolve)); }
}
const post = (base, path, input) => fetch(`${base}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });

test('review binds an idempotent order and capture to the same amount', async () => {
  let createCalls = 0;
  let captureCalls = 0;
  const paypal = {
    createOrder: async ({ amount }) => { createCalls++; assert.equal(amount, '25.00'); return { id: 'ORDER123' }; },
    captureOrder: async () => { captureCalls++; return { orderId: 'ORDER123', captureId: 'CAPTURE123', status: 'COMPLETED', amount: '25.00', currency: 'USD' }; }
  };
  const ai = { review: async () => ({ summary: 'Review this purchase', questions: [], risk: 'review' }) };
  await withServer(createApp({ paypal, ai, clientId: 'test-id' }), async base => {
    const review = await (await post(base, '/api/review', { item: 'Logo milestone', amount: '25.00', description: 'A logo draft is due tomorrow.' })).json();
    assert.equal((await post(base, '/api/capture', { reviewId: review.reviewId, orderId: 'OTHER123' })).status, 400);
    assert.equal(captureCalls, 0);
    const order = await (await post(base, '/api/order', { reviewId: review.reviewId })).json();
    const again = await (await post(base, '/api/order', { reviewId: review.reviewId })).json();
    assert.equal(order.orderId, again.orderId);
    assert.equal(createCalls, 1);
    const capture = await (await post(base, '/api/capture', { reviewId: review.reviewId, orderId: order.orderId })).json();
    assert.equal(capture.captureId, 'CAPTURE123');
    await post(base, '/api/capture', { reviewId: review.reviewId, orderId: order.orderId });
    assert.equal(captureCalls, 1);
  });
});

test('order retry reuses PayPal request identity after a lost reply', async () => {
  const references = [];
  const paypal = {
    createOrder: async ({ reference }) => {
      references.push(reference);
      if (references.length === 1) throw new Error('PayPal reply lost');
      return { id: 'ORDER123' };
    }
  };
  const ai = { review: async () => ({ summary: 'Check the terms.', questions: ['When?'], risk: 'review' }) };
  await withServer(createApp({ paypal, ai }), async base => {
    const review = await (await post(base, '/api/review', { item: 'Logo milestone', amount: '25.00', description: 'A logo draft is due tomorrow.' })).json();
    assert.equal((await post(base, '/api/order', { reviewId: review.reviewId })).status, 502);
    const retry = await (await post(base, '/api/order', { reviewId: review.reviewId })).json();
    assert.equal(retry.orderId, 'ORDER123');
    assert.equal(references.length, 2);
    assert.equal(references[0], references[1]);
  });
});

test('capture amount mismatch never reports success', async () => {
  const paypal = { createOrder: async () => ({ id: 'ORDER456' }), captureOrder: async () => ({ orderId: 'ORDER456', captureId: 'CAPTURE456', status: 'COMPLETED', amount: '1.00', currency: 'USD' }) };
  const ai = { review: async () => ({ summary: 'Review', questions: [], risk: 'review' }) };
  await withServer(createApp({ paypal, ai }), async base => {
    const review = await (await post(base, '/api/review', { item: 'Logo milestone', amount: '25.00', description: 'A logo draft is due tomorrow.' })).json();
    const order = await (await post(base, '/api/order', { reviewId: review.reviewId })).json();
    const response = await post(base, '/api/capture', { reviewId: review.reviewId, orderId: order.orderId });
    assert.equal(response.status, 502);
  });
});

test('capture response for a different order never reports success', async () => {
  const paypal = { createOrder: async () => ({ id: 'ORDER456' }), captureOrder: async () => ({ orderId: 'OTHER456', captureId: 'CAPTURE456', status: 'COMPLETED', amount: '25.00', currency: 'USD' }) };
  const ai = { review: async () => ({ summary: 'Review', questions: [], risk: 'review' }) };
  await withServer(createApp({ paypal, ai }), async base => {
    const review = await (await post(base, '/api/review', { item: 'Logo milestone', amount: '25.00', description: 'A logo draft is due tomorrow.' })).json();
    const order = await (await post(base, '/api/order', { reviewId: review.reviewId })).json();
    const response = await post(base, '/api/capture', { reviewId: review.reviewId, orderId: order.orderId });
    assert.equal(response.status, 502);
    assert.match((await response.json()).error, /No payment result was confirmed/);
  });
});

test('concurrent buyer requests create and capture one sandbox order', async () => {
  let creates = 0;
  let captures = 0;
  const paypal = {
    createOrder: async () => { creates++; await new Promise(resolve => setTimeout(resolve, 20)); return { id: 'ORDER789' }; },
    captureOrder: async () => { captures++; await new Promise(resolve => setTimeout(resolve, 20)); return { orderId: 'ORDER789', captureId: 'CAPTURE789', status: 'COMPLETED', amount: '25.00', currency: 'USD' }; }
  };
  const ai = { review: async () => ({ summary: 'Review the terms.', questions: [], risk: 'review' }) };
  await withServer(createApp({ paypal, ai }), async base => {
    const review = await (await post(base, '/api/review', { item: 'Logo milestone', amount: '25.00', description: 'A logo draft is due tomorrow.' })).json();
    const orders = await Promise.all(Array.from({ length: 3 }, async () => (await post(base, '/api/order', { reviewId: review.reviewId })).json()));
    assert.deepEqual(orders.map(order => order.orderId), ['ORDER789', 'ORDER789', 'ORDER789']);
    assert.equal(creates, 1);
    const results = await Promise.all(Array.from({ length: 3 }, async () => (await post(base, '/api/capture', { reviewId: review.reviewId, orderId: 'ORDER789' })).json()));
    assert.deepEqual(results.map(result => result.captureId), ['CAPTURE789', 'CAPTURE789', 'CAPTURE789']);
    assert.equal(captures, 1);
  });
});

test('restart keeps the order link and recovers a lost capture reply', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'checkout-guard-'));
  const stateFile = join(directory, 'state.json');
  let captureCalls = 0;
  const paypal = {
    createOrder: async () => ({ id: 'ORDER123' }),
    captureOrder: async () => {
      captureCalls++;
      return { orderId: 'ORDER123', captureId: 'CAPTURE123', status: 'COMPLETED', amount: '25.00', currency: 'USD' };
    }
  };
  const ai = { review: async () => ({ summary: 'Check the terms.', questions: ['When?'], risk: 'review' }) };
  let reviewId;
  try {
    await withServer(createApp({ paypal, ai, stateFile }), async base => {
      ({ reviewId } = await (await post(base, '/api/review', {
        item: 'Logo milestone', amount: '25.00', description: 'A logo draft is due tomorrow.'
      })).json());
      const order = await (await post(base, '/api/order', { reviewId })).json();
      assert.equal(order.orderId, 'ORDER123');
    });
    assert.equal(readFileSync(stateFile, 'utf8').includes('A logo draft'), false);
    await withServer(createApp({ paypal, ai, stateFile }), async base => {
      const recovered = await (await post(base, '/api/capture', { reviewId, orderId: 'ORDER123' })).json();
      assert.equal(recovered.captureId, 'CAPTURE123');
    });
    await withServer(createApp({ paypal, ai, stateFile }), async base => {
      const receipt = await (await post(base, '/api/capture', { reviewId, orderId: 'ORDER123' })).json();
      assert.equal(receipt.captureId, 'CAPTURE123');
    });
    assert.equal(captureCalls, 1);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('restart after a lost order reply reuses the same PayPal request ID', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'checkout-guard-'));
  const stateFile = join(directory, 'state.json');
  const references = [];
  const paypal = {
    createOrder: async ({ reference }) => {
      references.push(reference);
      if (references.length === 1) throw new Error('PayPal reply lost');
      return { id: 'ORDER123' };
    }
  };
  const ai = { review: async () => ({ summary: 'Check the terms.', questions: ['When?'], risk: 'review' }) };
  let reviewId;
  try {
    await withServer(createApp({ paypal, ai, stateFile }), async base => {
      ({ reviewId } = await (await post(base, '/api/review', {
        item: 'Logo milestone', amount: '25.00', description: 'A logo draft is due tomorrow.'
      })).json());
      assert.equal((await post(base, '/api/order', { reviewId })).status, 502);
    });
    await withServer(createApp({ paypal, ai, stateFile }), async base => {
      assert.equal((await (await post(base, '/api/order', { reviewId })).json()).orderId, 'ORDER123');
    });
    assert.equal(references.length, 2);
    assert.equal(references[0], references[1]);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
