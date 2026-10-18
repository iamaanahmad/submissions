const SANDBOX = 'https://api-m.sandbox.paypal.com';

export class PayPalSandbox {
  constructor({ clientId, clientSecret, fetcher = fetch }) {
    if (!clientId || !clientSecret) throw new Error('Sandbox client ID and secret are required');
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.fetcher = fetcher;
  }

  async token() {
    const basic = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
    const response = await this.fetcher(`${SANDBOX}/v1/oauth2/token`, {
      method: 'POST',
      headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=client_credentials'
    });
    const data = await response.json();
    if (!response.ok || !data.access_token) throw new Error('Sandbox token request failed');
    return data.access_token;
  }

  async createOrder({ amount, currency = 'USD', reference }) {
    if (!/^(0|[1-9]\d*)\.\d{2}$/.test(amount) || Number(amount) <= 0) {
      throw new Error('Amount must be a positive decimal with two places');
    }
    if (!/^[A-Z]{3}$/.test(currency)) throw new Error('Invalid currency');
    if (!/^[a-zA-Z0-9_-]{8,127}$/.test(reference)) throw new Error('Invalid reference');
    const token = await this.token();
    const response = await this.fetcher(`${SANDBOX}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'PayPal-Request-Id': reference
      },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [{ reference_id: reference, amount: { currency_code: currency, value: amount } }]
      })
    });
    const data = await response.json();
    if (!response.ok || !data.id) throw new Error('Sandbox order creation failed');
    return {
      id: data.id,
      status: data.status,
      approveUrl: data.links?.find(link => link.rel === 'approve')?.href ?? null
    };
  }

  async captureOrder(orderId, reference, expectedAmount) {
    if (!/^[A-Z0-9]{8,32}$/.test(orderId)) throw new Error('Invalid order ID');
    if (!/^[a-zA-Z0-9_-]{8,127}$/.test(reference)) throw new Error('Invalid reference');
    if (!/^(0|[1-9]\d*)\.\d{2}$/.test(expectedAmount) || Number(expectedAmount) <= 0) throw new Error('Invalid amount');
    const token = await this.token();
    const details = await this.fetcher(`${SANDBOX}/v2/checkout/orders/${orderId}`, {
      method: 'GET', headers: { Authorization: `Bearer ${token}` }
    });
    const order = await details.json();
    const unit = order.purchase_units?.[0];
    if (!details.ok || order.id !== orderId || order.status !== 'APPROVED' ||
      order.purchase_units?.length !== 1 || unit.reference_id !== reference ||
      unit.amount?.value !== expectedAmount || unit.amount?.currency_code !== 'USD') {
      throw new Error('Sandbox order is not approved for this reviewed purchase');
    }
    const response = await this.fetcher(`${SANDBOX}/v2/checkout/orders/${orderId}/capture`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'PayPal-Request-Id': `${reference}_capture`
      },
      body: '{}'
    });
    const data = await response.json();
    if (!response.ok) throw new Error('Sandbox capture failed');
    const units = data.purchase_units;
    const captures = units?.[0]?.payments?.captures;
    const capture = captures?.[0];
    if (data.id !== orderId || data.status !== 'COMPLETED' ||
      units?.length !== 1 || captures?.length !== 1 ||
      typeof capture?.id !== 'string' || !capture.id ||
      capture.status !== 'COMPLETED' ||
      !/^(0|[1-9]\d*)\.\d{2}$/.test(capture.amount?.value ?? '') ||
      capture.amount?.currency_code !== 'USD') {
      throw new Error('Sandbox capture not completed');
    }
    return { orderId: data.id, captureId: capture.id, status: capture.status,
      amount: capture.amount?.value, currency: capture.amount?.currency_code };
  }
}
