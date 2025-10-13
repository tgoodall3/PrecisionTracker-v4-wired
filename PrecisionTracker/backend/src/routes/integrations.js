import express from 'express';
import Stripe from 'stripe';
import twilio from 'twilio';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

// Stripe Checkout link creation (placeholder if no key)
router.post('/stripe/checkout-link', requireAuth(), async (req, res) => {
  const { amount, description } = req.body;
  if(!process.env.STRIPE_SECRET){
    return res.json({ url: `https://example-payments.test/checkout?desc=${encodeURIComponent(description||'Invoice')}&amount=${amount}` });
  }
  const stripe = new Stripe(process.env.STRIPE_SECRET);
  const product = await stripe.products.create({ name: description || 'Contracting Invoice' });
  const price = await stripe.prices.create({ unit_amount: Math.round(amount*100), currency: 'usd', product: product.id });
  const link = await stripe.paymentLinks.create({ line_items: [{ price: price.id, quantity: 1 }] });
  res.json({ url: link.url });
});

// Twilio SMS (placeholder if no creds)
router.post('/twilio/sms', requireAuth(), async (req, res) => {
  const { to, message } = req.body;
  if(!process.env.TWILIO_SID || !process.env.TWILIO_TOKEN || !process.env.TWILIO_FROM){
    console.log('SMS (mock):', { to, message });
    return res.json({ sent: true, mock: true });
  }
  const client = twilio(process.env.TWILIO_SID, process.env.TWILIO_TOKEN);
  const resp = await client.messages.create({ from: process.env.TWILIO_FROM, to, body: message });
  res.json({ sid: resp.sid });
});

// QuickBooks scaffolding (placeholder)
router.post('/qbo/push-invoice', requireAuth(), async (req, res) => {
  // In production: OAuth2 to QBO and push invoice/customer
  res.json({ ok: true, note: 'QBO integration placeholder' });
});

export default router;