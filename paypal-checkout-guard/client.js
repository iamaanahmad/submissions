const form = document.querySelector('#purchase-form');
const message = document.querySelector('#message');
const setup = document.querySelector('#setup');
const reviewButton = document.querySelector('#review-button');
let config;
let reviewId;

async function request(path, data) {
  const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || 'Request failed');
  return payload;
}
function notice(text) { message.textContent = text; }
function clearReview() {
  reviewId = undefined;
  document.querySelector('#review-result').hidden = true;
  document.querySelector('#paypal-button-container').replaceChildren();
  document.querySelector('#empty-review').hidden = false;
  document.querySelector('#success').hidden = true;
}
function showReview(review) {
  document.querySelector('#empty-review').hidden = true;
  document.querySelector('#success').hidden = true;
  document.querySelector('#review-result').hidden = false;
  document.querySelector('#summary').textContent = review.summary;
  const questions = document.querySelector('#questions');
  questions.replaceChildren(...review.questions.map(question => {
    const li = document.createElement('li'); li.textContent = question; return li;
  }));
}
function loadPayPal() {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(config.clientId)}&currency=USD&intent=capture&components=buttons`;
    script.onload = resolve; script.onerror = () => reject(new Error('PayPal buttons could not load'));
    document.head.append(script);
  });
}
async function renderPayPal() {
  await loadPayPal();
  document.querySelector('#paypal-button-container').replaceChildren();
  await window.paypal.Buttons({
    style: { layout: 'vertical', shape: 'rect', label: 'pay' },
    createOrder: async () => (await request('/api/order', { reviewId })).orderId,
    onApprove: async ({ orderID }) => {
      try {
        const capture = await request('/api/capture', { reviewId, orderId: orderID });
        document.querySelector('#review-result').hidden = true;
        document.querySelector('#success').hidden = false;
        document.querySelector('#receipt').textContent = `Order ${capture.orderId} · Capture ${capture.captureId} · USD ${capture.amount}`;
        notice('');
      } catch (error) { notice(error.message); }
    },
    onCancel: () => notice('Payment was cancelled. No capture was requested.'),
    onError: () => notice('PayPal could not complete the sandbox checkout. No capture was confirmed.')
  }).render('#paypal-button-container');
}

config = await fetch('/api/config').then(response => response.json());
if (!config.paypalReady || !config.aiReady) {
  const missing = [!config.paypalReady && 'PayPal sandbox', !config.aiReady && 'AI provider'].filter(Boolean).join(' and ');
  setup.textContent = `${missing} access is needed for a live review and payment.`;
  reviewButton.disabled = true;
}
form.addEventListener('submit', async event => {
  event.preventDefault(); notice('');
  clearReview();
  reviewButton.disabled = true; reviewButton.textContent = 'Reviewing purchase…';
  try {
    const data = Object.fromEntries(new FormData(form));
    data.amount = Number(data.amount).toFixed(2);
    const result = await request('/api/review', data);
    reviewId = result.reviewId;
    showReview(result.review);
    await renderPayPal();
  } catch (error) { notice(error.message); }
  finally { reviewButton.disabled = false; reviewButton.innerHTML = 'Review purchase <span aria-hidden="true">↗</span>'; }
});
form.addEventListener('input', clearReview);
