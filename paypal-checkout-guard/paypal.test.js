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
