import test from 'node:test';
import assert from 'node:assert/strict';
import { PayPalSandbox } from './paypal.js';

test('creates an idempotent sandbox order and returns payer approval link', async () => {
  const calls = [];
  const fetcher = async (url, options) => {
    calls.push({ url, options });
    return url.endsWith('/token')
      ? { ok: true, json: async () => ({ access_token: 'test-token' }) }
      : { ok: true, json: async () => ({ id: 'ORDER123', status: 'CREATED', links: [{ rel: 'approve', href: 'https://www.sandbox.paypal.com/checkoutnow?token=ORDER123' }] }) };
  };
  const client = new PayPalSandbox({ clientId: 'test-id', clientSecret: 'test-secret', fetcher });
  const order = await client.createOrder({ amount: '12.00', reference: 'test-order-001' });
  assert.equal(order.id, 'ORDER123');
  assert.match(order.approveUrl, /sandbox\.paypal\.com/);
  assert.equal(calls[1].options.headers['PayPal-Request-Id'], 'test-order-001');
  assert.equal(JSON.parse(calls[1].options.body).purchase_units[0].amount.value, '12.00');
  assert.ok(calls.every(call => call.url.startsWith('https://api-m.sandbox.paypal.com/')));
});

test('rejects invalid amounts before any network request', async () => {
  const client = new PayPalSandbox({ clientId: 'test-id', clientSecret: 'test-secret', fetcher: () => { throw new Error('network touched'); } });
  await assert.rejects(client.createOrder({ amount: '-1.00', reference: 'test-order-001' }), /Amount/);
  await assert.rejects(client.createOrder({ amount: '1', reference: 'test-order-001' }), /Amount/);
});

test('does not expose provider response bodies on an auth failure', async () => {
  const client = new PayPalSandbox({ clientId: 'test-id', clientSecret: 'test-secret', fetcher: async () => ({ ok: false, json: async () => ({ debug_id: 'private' }) }) });
  await assert.rejects(client.token(), /^Error: Sandbox token request failed$/);
});

test('capture requires a completed sandbox payment', async () => {
  const urls = [];
  const client = new PayPalSandbox({ clientId: 'test-id', clientSecret: 'test-secret', fetcher: async url => {
    urls.push(url);
    return url.endsWith('/token') ? { ok: true, json: async () => ({ access_token: 'test-token' }) }
      : url.endsWith('/ORDER123') ? { ok: true, json: async () => ({ id: 'ORDER123', status: 'APPROVED', purchase_units: [{ reference_id: 'test-order-001', amount: { value: '12.00', currency_code: 'USD' } }] }) }
      : { ok: true, json: async () => ({ id: 'ORDER123', status: 'COMPLETED', purchase_units: [{ reference_id: 'test-order-001', amount: { value: '12.00', currency_code: 'USD' }, payments: { captures: [{ id: 'CAPTURE123', status: 'COMPLETED', amount: { value: '12.00', currency_code: 'USD' } }] } }] }) };
  } });
  const capture = await client.captureOrder('ORDER123', 'test-order-001', '12.00');
  assert.equal(urls[2], 'https://api-m.sandbox.paypal.com/v2/checkout/orders/ORDER123/capture');
  assert.equal(capture.captureId, 'CAPTURE123');
});

test('unapproved or changed order cannot reach capture', async () => {
  for (const change of [
    { status: 'CREATED' },
    { purchase_units: [{ reference_id: 'other-order', amount: { value: '12.00', currency_code: 'USD' } }] },
    { purchase_units: [{ reference_id: 'test-order-001', amount: { value: '13.00', currency_code: 'USD' } }] }
  ]) {
    let captureCalled = false;
    const client = new PayPalSandbox({ clientId: 'test-id', clientSecret: 'test-secret', fetcher: async url => {
      if (url.endsWith('/token')) return { ok: true, json: async () => ({ access_token: 'test-token' }) };
      if (url.endsWith('/capture')) { captureCalled = true; throw new Error('capture reached'); }
      return { ok: true, json: async () => ({ id: 'ORDER123', status: 'APPROVED', purchase_units: [{ reference_id: 'test-order-001', amount: { value: '12.00', currency_code: 'USD' } }], ...change }) };
    } });
    await assert.rejects(client.captureOrder('ORDER123', 'test-order-001', '12.00'), /not approved/);
    assert.equal(captureCalled, false);
  }
});

test('capture rejects a completed order without one verifiable USD capture', async () => {
  const base = { id: 'ORDER123', status: 'COMPLETED', purchase_units: [{ reference_id: 'test-order-001', amount: { value: '12.00', currency_code: 'USD' }, payments: { captures: [{ id: 'CAPTURE123', status: 'COMPLETED', amount: { value: '12.00', currency_code: 'USD' } }] } }] };
  for (const data of [
    { ...base, purchase_units: [{ ...base.purchase_units[0], payments: { captures: [{ status: 'COMPLETED', amount: { value: '12.00', currency_code: 'USD' } }] } }] },
    { ...base, purchase_units: [{ ...base.purchase_units[0], payments: { captures: [{ id: 'CAPTURE123', status: 'COMPLETED', amount: { value: '12.00', currency_code: 'EUR' } }] } }] },
    { ...base, purchase_units: [{ ...base.purchase_units[0], payments: { captures: [{ id: 'CAPTURE123', status: 'COMPLETED', amount: { value: '12.00', currency_code: 'USD' } }, { id: 'CAPTURE456', status: 'COMPLETED', amount: { value: '1.00', currency_code: 'USD' } }] } }] },
    { ...base, purchase_units: [{ ...base.purchase_units[0], payments: { captures: [{ id: 'CAPTURE123', status: 'COMPLETED', amount: { value: '11.00', currency_code: 'USD' } }] } }] }
  ]) {
    const client = new PayPalSandbox({ clientId: 'test-id', clientSecret: 'test-secret', fetcher: async url => url.endsWith('/token')
      ? { ok: true, json: async () => ({ access_token: 'test-token' }) }
      : url.endsWith('/ORDER123') ? { ok: true, json: async () => ({ id: 'ORDER123', status: 'APPROVED', purchase_units: [{ reference_id: 'test-order-001', amount: { value: '12.00', currency_code: 'USD' } }] }) }
      : { ok: true, json: async () => data } });
    await assert.rejects(client.captureOrder('ORDER123', 'test-order-001', '12.00'), /not completed/);
  }
});

test('lost capture reply recovers completed PayPal proof without a second capture', async () => {
  const urls = [];
  const order = { id: 'ORDER123', status: 'COMPLETED', purchase_units: [{
    reference_id: 'test-order-001', amount: { value: '12.00', currency_code: 'USD' },
    payments: { captures: [{ id: 'CAPTURE123', status: 'COMPLETED', amount: { value: '12.00', currency_code: 'USD' } }] }
  }] };
  const client = new PayPalSandbox({ clientId: 'test-id', clientSecret: 'test-secret', fetcher: async url => {
    urls.push(url);
    if (url.endsWith('/token')) return { ok: true, json: async () => ({ access_token: 'test-token' }) };
    if (url.endsWith('/ORDER123')) return { ok: true, json: async () => order };
    throw new Error('second capture attempted');
  } });
  assert.equal((await client.captureOrder('ORDER123', 'test-order-001', '12.00')).captureId, 'CAPTURE123');
  assert.equal(urls.length, 2);
});
