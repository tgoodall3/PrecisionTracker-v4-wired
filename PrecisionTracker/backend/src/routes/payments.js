import express from 'express';
import Stripe from 'stripe';
import { requireAuth } from '../middleware/auth.js';
import { Invoice, Payment } from '../models/index.js';

const router = express.Router();

function buildStripe() {
  if (!process.env.STRIPE_SECRET) return null;
  return new Stripe(process.env.STRIPE_SECRET);
}

async function buildSquare() {
  if (!process.env.SQUARE_ACCESS_TOKEN) return null;
  try {
    const squareModule = await import('@square/square');
    const SquareClient = squareModule.Client;
    return new SquareClient({
      accessToken: process.env.SQUARE_ACCESS_TOKEN,
      environment: process.env.SQUARE_ENV === 'production' ? 'production' : 'sandbox',
    });
  } catch (error) {
    console.warn('Square SDK unavailable', error?.message || error);
    return null;
  }
}

router.post('/stripe/intent', requireAuth(), async (req, res) => {
  const { amount, currency = 'usd', customerEmail, metadata = {} } = req.body || {};
  const stripe = buildStripe();
  if (!stripe) {
    return res.status(503).json({ error: 'Stripe not configured' });
  }
  if (!amount) return res.status(400).json({ error: 'amount required' });
  try {
    const intent = await stripe.paymentIntents.create({
      amount: Math.round(Number(amount) * 100),
      currency,
      receipt_email: customerEmail || undefined,
      metadata,
      automatic_payment_methods: { enabled: true },
    });
    res.json({ clientSecret: intent.client_secret, intentId: intent.id });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Stripe error' });
  }
});

router.post('/square/checkout', requireAuth(), async (req, res) => {
  const { amount, currency = 'USD', description = 'Invoice payment', redirectUrl } = req.body || {};
  const square = await buildSquare();
  if (!square) return res.status(503).json({ error: 'Square not configured' });
  if (!amount) return res.status(400).json({ error: 'amount required' });
  try {
    const response = await square.checkoutApi.createPaymentLink({
      idempotencyKey: `pl_${Date.now()}`,
      checkoutOptions: {
        redirectUrl: redirectUrl || process.env.SQUARE_REDIRECT_URL || undefined,
      },
      order: {
        locationId: process.env.SQUARE_LOCATION_ID,
        lineItems: [
          {
            name: description,
            quantity: '1',
            basePriceMoney: {
              amount: Math.round(Number(amount) * 100),
              currency,
            },
          },
        ],
      },
    });
    res.json({ url: response.result?.paymentLink?.url });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Square error' });
  }
});

router.post('/invoices/:id/record', requireAuth(), async (req, res) => {
  const invoice = await Invoice.findByPk(req.params.id);
  if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
  const { amount, method = 'CARD', receivedAt = new Date() } = req.body || {};
  if (!amount) return res.status(400).json({ error: 'amount required' });
  const payment = await Payment.create({
    invoiceId: invoice.id,
    amount,
    method,
    receivedAt,
  });
  const payments = await Payment.findAll({ where: { invoiceId: invoice.id } });
  const balance = payments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
  const amountDue = Math.max(Number(invoice.amount || 0) - balance, 0);
  if (amountDue <= 0) {
    await invoice.update({ status: 'PAID' });
  } else if (balance > 0) {
    await invoice.update({ status: 'PART_PAID' });
  }
  res.json({ payment, invoice: await Invoice.findByPk(invoice.id, { include: [Payment] }) });
});

export default router;
