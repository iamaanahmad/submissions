const form = document.querySelector('#purchase-form');
const message = document.querySelector('#message');
const setup = document.querySelector('#setup');
const reviewButton = document.querySelector('#review-button');
let config;
let reviewId;
let revision = 0;
let paypalScript;
let pendingCapture;
const retryCapture = document.querySelector('#retry-capture');

async function request(path, data) {
  const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || 'Request failed');
  return payload;
}
function notice(text) { message.textContent = text; }
function clearReview() {
  revision++;
  reviewId = undefined;
  // Keep the status check for an approved order until its result is known.
  if (!pendingCapture) retryCapture.hidden = true;
  document.querySelector('#review-result').hidden = true;
  document.querySelector('#paypal-button-container').replaceChildren();
  document.querySelector('#empty-review').hidden = false;
  document.querySelector('#success').hidden = true;
}
async function settleCapture(attempt) {
  retryCapture.disabled = true;
  try {
    const capture = await request('/api/capture', { reviewId: attempt.reviewId, orderId: attempt.orderId });
    pendingCapture = undefined;
    retryCapture.hidden = true;
    if (revision !== attempt.revision) {
      notice(`Sandbox payment completed. Order ${capture.orderId} · Capture ${capture.captureId}. Review the new purchase separately.`);
      return;
    }
    document.querySelector('#review-result').hidden = true;
    document.querySelector('#success').hidden = false;
    document.querySelector('#receipt').textContent = `Order ${capture.orderId} · Capture ${capture.captureId} · USD ${capture.amount}`;
    notice('');
  } catch (error) {
    const prior = revision !== attempt.revision;
    notice(`${error.message} Check ${prior ? 'the prior' : 'the same'} sandbox order before starting another payment.`);
    retryCapture.hidden = false;
  } finally { retryCapture.disabled = false; }
}
function showReview(review) {
  document.querySelector('#empty-review').hidden = true;
  document.querySelector('#success').hidden = true;
  document.querySelector('#review-result').hidden = false;
  document.querySelector('#review-risk').textContent = review.risk === 'caution' ? 'AI review · use caution' : 'AI review · check it yourself';
  document.querySelector('#summary').textContent = review.summary;
  const questions = document.querySelector('#questions');
  questions.replaceChildren(...review.questions.map(question => {
    const li = document.createElement('li'); li.textContent = question; return li;
  }));
}
function loadPayPal() {
  paypalScript ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(config.clientId)}&currency=USD&intent=capture&components=buttons`;
    script.onload = resolve;
    script.onerror = () => { paypalScript = undefined; reject(new Error('PayPal buttons could not load')); };
    document.head.append(script);
  });
  return paypalScript;
}
async function renderPayPal(currentRevision, currentReviewId) {
  await loadPayPal();
  if (revision !== currentRevision) return;
  document.querySelector('#paypal-button-container').replaceChildren();
  await window.paypal.Buttons({
    style: { layout: 'vertical', shape: 'rect', label: 'pay' },
    createOrder: async () => {
      if (revision !== currentRevision) throw new Error('Purchase changed. Review it again.');
      if (pendingCapture) throw new Error('Check the prior sandbox order before starting another payment.');
      return (await request('/api/order', { reviewId: currentReviewId })).orderId;
    },
    onApprove: async ({ orderID }) => {
      if (revision !== currentRevision) return notice('Purchase changed. Review it again.');
      if (pendingCapture) return notice('Check the prior sandbox order before starting another payment.');
      pendingCapture = { reviewId: currentReviewId, orderId: orderID, revision: currentRevision };
      await settleCapture(pendingCapture);
    },
    onCancel: () => notice('Payment was cancelled. No capture was requested.'),
    onError: () => notice('PayPal could not complete the sandbox checkout. No capture was confirmed.')
  }).render('#paypal-button-container');
  if (revision !== currentRevision) document.querySelector('#paypal-button-container').replaceChildren();
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
  const submittedRevision = revision;
  try {
    const data = Object.fromEntries(new FormData(form));
    data.amount = Number(data.amount).toFixed(2);
    const result = await request('/api/review', data);
    if (revision !== submittedRevision) return;
    reviewId = result.reviewId;
    showReview(result.review);
    await renderPayPal(submittedRevision, reviewId);
  } catch (error) { if (revision === submittedRevision) notice(error.message); }
  finally { reviewButton.disabled = false; reviewButton.innerHTML = 'Review purchase <span aria-hidden="true">↗</span>'; }
});
form.addEventListener('input', clearReview);
retryCapture.addEventListener('click', async () => {
  if (pendingCapture && !retryCapture.disabled) await settleCapture(pendingCapture);
});
