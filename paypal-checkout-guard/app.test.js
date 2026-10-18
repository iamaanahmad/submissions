import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from './app.js';

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
