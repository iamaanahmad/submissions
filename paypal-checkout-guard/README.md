# PayPal Checkout Guard

This is the sandbox payment foundation for a PayPal AI Hackathon entry. It is not a completed entry. The current module obtains a sandbox OAuth token and creates an idempotent order. A payer approval step, a safe capture action, the AI workflow, UI, live sandbox proof, and a public demo remain to build and verify.

The client requires `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET` from a PayPal developer sandbox app. Do not put these values in source control. It calls only `api-m.sandbox.paypal.com`, never the live API. No real money moves.

Run `npm test` for local transport checks. These tests use a fake HTTP transport. They do not prove a real PayPal integration.

Sources: [official contest rules](https://paypalaihackathon.devpost.com/rules), [PayPal Checkout integration guide](https://developer.paypal.com/platforms/checkout/standard/integrate).
