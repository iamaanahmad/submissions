# PayPal Checkout Guard

Checkout Guard is a sandbox purchase review for the [PayPal AI Hackathon](https://paypalaihackathon.devpost.com/rules). A buyer describes a purchase, reads an AI summary and questions, then approves a PayPal sandbox payment. The app captures only the order created for that review and checks the captured amount. It never calls PayPal's live API.

**Status:** The local buyer flow and provider adapters are implemented. Nine local tests pass with fake provider responses. A real PayPal sandbox approval and capture, and a real AI response, have **not** been verified. This is not a contest submission or a claim of a working live integration.

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
3. Select the PayPal sandbox button and approve with a sandbox buyer account.
4. The server captures the order once, checks its amount, and shows the sandbox order and capture IDs.

Editing the purchase clears the old review and its PayPal button. The server accepts captures only for an order it created for the active review. A missing or failed provider call never becomes a success message. Review and order state is held in memory and expires after 30 minutes. Restarting the server clears that state.

## Real verification and contest gates

- Supply sandbox credentials and a model key through a secure runtime connection. Verify one real AI response, then one real PayPal buyer approval and capture. Record IDs and timestamps without exposing secrets.
- Check Amaan's PayPal, sponsor, administrator, judge, and household ties against the official eligibility rules.
- Confirm the project idea and open-source licensing rights. Add a license only after project-specific authorization.
- Publish a working demo with a public video under three minutes, public source and setup, and a submission receipt before the November 12, 2026 deadline.

The app is a local prototype. It uses memory for session state and binds to localhost. Deploying it for public use requires persistent sessions, abuse controls, and deployment checks.

Sources: [official rules](https://paypalaihackathon.devpost.com/rules), [PayPal Checkout guide](https://developer.paypal.com/platforms/checkout/standard/integrate), [PayPal JavaScript SDK reference](https://developer.paypal.com/sdk/js/reference/).
