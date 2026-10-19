import { AIReview } from './ai.js';
import { PayPalSandbox } from './paypal.js';

const required = ['OPENAI_API_KEY', 'PAYPAL_CLIENT_ID', 'PAYPAL_CLIENT_SECRET'];
const missing = required.filter(name => !process.env[name]);
if (missing.length) {
  process.stderr.write(`Missing provider access: ${missing.join(', ')}\n`);
  process.exitCode = 2;
} else {
  const checkedAt = new Date().toISOString();
  let aiVerified = false;
  let paypalVerified = false;

  try {
    const ai = new AIReview({
      apiKey: process.env.OPENAI_API_KEY,
      model: process.env.OPENAI_MODEL || undefined
    });
    const review = await ai.review({
      item: 'Test notebook',
      amount: '1.00',
      description: 'Marked integration check. No buyer or real purchase is involved.'
    });
    aiVerified = Boolean(review.summary && review.questions.length && review.risk);
  } catch {
    process.stderr.write('AI review failed. Check provider access and model settings.\n');
  }

  try {
    const paypal = new PayPalSandbox({
      clientId: process.env.PAYPAL_CLIENT_ID,
      clientSecret: process.env.PAYPAL_CLIENT_SECRET
    });
    paypalVerified = Boolean(await paypal.token());
  } catch {
    process.stderr.write('PayPal sandbox authentication failed. Check app access.\n');
  }

  process.stdout.write(JSON.stringify({ checkedAt, aiVerified, paypalVerified,
    buyerApprovalVerified: false, captureVerified: false }) + '\n');
  if (!aiVerified || !paypalVerified) process.exitCode = 1;
}
