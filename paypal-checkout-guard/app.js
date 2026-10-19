import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { PayPalSandbox } from './paypal.js';
import { AIReview } from './ai.js';

const pages = new Map();
const sessions = new Map();
const MAX_BODY = 5000;
const REVIEW_TTL = 30 * 60_000;
const json = (res, status, data) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(JSON.stringify(data)); };

async function body(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > MAX_BODY) throw new Error('Request too large');
  }
  return JSON.parse(raw);
}

export function createApp({ paypal, ai, clientId = '', fileReader = readFile }) {
  return createServer(async (req, res) => {
    try {
      const path = new URL(req.url, 'http://localhost').pathname;
      if (req.method === 'GET' && path === '/api/config') return json(res, 200, { paypalReady: !!paypal, aiReady: !!ai, clientId });
      if (req.method === 'GET' && ['/', '/style.css', '/client.js'].includes(path)) {
        const file = path === '/' ? 'index.html' : path.slice(1);
        const types = { 'index.html': 'text/html', 'style.css': 'text/css', 'client.js': 'text/javascript' };
        res.writeHead(200, { 'Content-Type': `${types[file]}; charset=utf-8`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
        return res.end(await fileReader(new URL(file, import.meta.url)));
      }
      if (req.method !== 'POST') return json(res, 404, { error: 'Not found' });
      if (!['/api/review', '/api/order', '/api/capture'].includes(path)) return json(res, 404, { error: 'Not found' });
      if (req.headers['content-type']?.split(';')[0] !== 'application/json') return json(res, 415, { error: 'Use JSON' });
      const origin = req.headers.origin;
      const host = req.headers.host;
      if (origin && new URL(origin).host !== host) return json(res, 403, { error: 'Cross-site requests are blocked' });
      const input = await body(req);
      if (path === '/api/review') {
        if (!ai) return json(res, 503, { error: 'AI provider is not configured' });
        const review = await ai.review(input);
        const reviewId = randomUUID();
        sessions.set(reviewId, { item: input.item, amount: input.amount, description: input.description, review, created: Date.now() });
        return json(res, 200, { reviewId, review });
      }
      if (!paypal) return json(res, 503, { error: 'PayPal sandbox is not configured' });
      if (path === '/api/order') {
        const session = sessions.get(input.reviewId);
        if (!session || Date.now() - session.created > REVIEW_TTL) return json(res, 400, { error: 'Review expired. Start again.' });
        if (session.order) return json(res, 200, { orderId: session.order.id });
        if (session.orderPending) {
          const order = await session.orderPending;
          return json(res, 200, { orderId: order.id });
        }
        // Reuse PayPal's request ID if the first order response was lost.
        session.reference ??= `guard_${session.created}_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
        session.orderPending = paypal.createOrder({ amount: session.amount, reference: session.reference });
        let order;
        try { order = await session.orderPending; }
        finally { session.orderPending = null; }
        session.order = order;
        pages.set(order.id, { reviewId: input.reviewId, reference: session.reference, amount: session.amount });
        return json(res, 200, { orderId: order.id });
      }
      const record = pages.get(input.orderId);
      if (!record || record.reviewId !== input.reviewId) return json(res, 400, { error: 'Order does not match this review' });
      const session = sessions.get(input.reviewId);
      if (!session || Date.now() - session.created > REVIEW_TTL) return json(res, 400, { error: 'Review expired. Start again.' });
      if (record.capture) return json(res, 200, record.capture);
      if (record.capturePending) return json(res, 200, await record.capturePending);
      record.capturePending = (async () => {
        const result = await paypal.captureOrder(input.orderId, record.reference, record.amount);
        if (result.orderId !== input.orderId || result.status !== 'COMPLETED' ||
          typeof result.captureId !== 'string' || !result.captureId ||
          result.amount !== record.amount || result.currency !== 'USD') {
          throw new Error('Sandbox capture did not match the reviewed order');
        }
        return result;
      })();
      let capture;
      try { capture = await record.capturePending; }
      finally { record.capturePending = null; }
      record.capture = capture;
      return json(res, 200, capture);
    } catch (error) {
      const invalid = error instanceof SyntaxError || /^(Invalid|Item must|Description must|Request too large)/.test(error.message);
      json(res, invalid ? 400 : 502, { error: invalid ? error.message : 'Provider action failed. No payment result was confirmed.' });
    }
  });
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const { PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, OPENAI_API_KEY, OPENAI_MODEL } = process.env;
  const paypal = PAYPAL_CLIENT_ID && PAYPAL_CLIENT_SECRET ? new PayPalSandbox({ clientId: PAYPAL_CLIENT_ID, clientSecret: PAYPAL_CLIENT_SECRET }) : null;
  const ai = OPENAI_API_KEY ? new AIReview({ apiKey: OPENAI_API_KEY, model: OPENAI_MODEL || undefined }) : null;
  const port = Number(process.env.PORT || 4177);
  createApp({ paypal, ai, clientId: paypal ? PAYPAL_CLIENT_ID : '' }).listen(port, '127.0.0.1', () => {
    process.stdout.write(`Checkout Guard listening at http://127.0.0.1:${port}\n`);
  });
}
