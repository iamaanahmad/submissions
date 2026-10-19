# PayPal Checkout Guard

Checkout Guard is a sandbox purchase review for the [PayPal AI Hackathon](https://paypalaihackathon.devpost.com/rules). A buyer describes a purchase, reads an AI summary and questions, then approves a PayPal sandbox payment. The app captures only the order created for that review and checks the captured amount. It never calls PayPal's live API.

**Status:** The local buyer flow and provider adapters are implemented. Seventeen local tests pass with fake provider responses. A real PayPal sandbox approval and capture, and a real AI response, have **not** been verified. This is not a contest submission or a claim of a working live integration.

## Run locally

Use a PayPal Developer **sandbox** app and an OpenAI API key in your shell. Never put credentials in a file committed to Git.

```sh
export PAYPAL_CLIENT_ID='sandbox-client-id'
export PAYPAL_CLIENT_SECRET='sandbox-client-secret'
export OPENAI_API_KEY='model-api-key'
export OPENAI_MODEL='gpt-4.1-mini' # optional
npm start
```

Open `http://127.0.0.1:4177/`. The server binds to localhost. If either provider is missing, the page says which one and disables checkout. The PayPal JavaScript SDK uses the sandbox client ID. The server uses the sandbox OAuth, order creation, and capture endpoints. The AI adapter uses the Responses API with `store: false` and a structured response.

Run `npm test` for local checks. Tests use fake transports. They do not prove a real provider call.

## Buyer path

1. Enter an item, a description, and a USD price.
2. Read the AI review. It asks questions; it does not certify the seller or recommend payment.
   A caution label appears when the AI response marks the purchase for extra care.
3. Select the PayPal sandbox button and approve with a sandbox buyer account.
4. The server captures the order once, checks its amount, and shows the sandbox order and capture IDs.

Editing the purchase clears the old review and its PayPal button. The server accepts captures only for an order it created for the active review. A missing or failed provider call never becomes a success message. Review and order state is held in memory and expires after 30 minutes. Restarting the server clears that state.

If a buyer edits details while the AI response or PayPal buttons load, the old review cannot reopen checkout. Concurrent requests for one review share one order and one capture. A review that expires before capture must be started again.

If the buyer edits a new purchase after PayPal approval but before the capture reply arrives, the page shows the completed sandbox receipt separately. It does not present that receipt as payment for the new purchase.

An incomplete AI response, refusal, or empty review blocks checkout. The app never turns these into a reassuring review.

Before capture, the server reads the sandbox order from PayPal. It requires PayPal's `APPROVED` status, the same purchase reference, and the reviewed USD amount. A browser callback alone cannot authorize capture. A changed or unapproved order stops before the capture request. This guard is covered by fake-provider tests; a real sandbox buyer action remains unverified.

A receipt appears only when PayPal reports one completed USD capture with an ID for the same order and reviewed amount. Missing capture details or a different order cannot become a success message.

If PayPal completes a capture but its first reply is lost, retrying reads PayPal's order. A matching completed capture restores the receipt without another capture request. A missing or changed capture still cannot appear as paid.

If the browser loses the first capture reply, **Check payment status** retries that same reviewed order. The button appears only after PayPal buyer approval and a capture response error. It cannot start a different purchase. The server checks PayPal before it displays any receipt.

## Video plan (record only after real provider checks)

Keep the public YouTube video below three minutes. Show the actual browser and sandbox buyer account. Do not replace provider actions with local test responses.

1. **0:00–0:25:** Show the buyer problem: a purchase description may omit delivery and refund terms.
2. **0:25–1:05:** Enter a sample purchase. Show the real AI response and the questions it raises.
3. **1:05–1:50:** Open PayPal's sandbox approval. Show that the buyer decides whether to approve.
4. **1:50–2:20:** Approve and return. Show the completed sandbox capture ID and amount.
5. **2:20–2:45:** Change the purchase details. Show that the old review and payment button disappear. Close on the project source and setup instructions.

Record one uninterrupted working path plus any brief cuts needed for privacy. Hide sandbox account credentials and API keys. The current local preview and fake-provider tests are development evidence, not this video.

## Real verification and contest gates

- Supply sandbox credentials and a model key through a secure runtime connection. Verify one real AI response, then one real PayPal buyer approval and capture. Record IDs and timestamps without exposing secrets.
- Check Amaan's PayPal, sponsor, administrator, judge, and household ties against the official eligibility rules.
- Confirm the project idea and open-source licensing rights. Add a license only after project-specific authorization.
- Publish a working demo with a public YouTube video under three minutes, public source and setup, and a submission receipt before the November 12, 2026 deadline. The open-source license must be visible at the top of the public repository page, as the rules require.

The app is a local prototype. It uses memory for session state and binds to localhost. Deploying it for public use requires persistent sessions, abuse controls, and deployment checks.

Sources: [official rules](https://paypalaihackathon.devpost.com/rules), [PayPal Checkout guide](https://developer.paypal.com/platforms/checkout/standard/integrate), [PayPal JavaScript SDK reference](https://developer.paypal.com/sdk/js/reference/).
