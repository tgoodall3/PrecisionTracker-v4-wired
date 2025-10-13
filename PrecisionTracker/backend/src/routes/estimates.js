import express from 'express';
import { Estimate, EstimateItem } from '../models/index.js';
import { requireAuth } from '../middleware/auth.js';
import { createPaymentLink } from '../utils/payments.js';
import { sendEmail, sendSms } from '../utils/notifier.js';

const router = express.Router();

router.get('/:id', requireAuth(), async (req, res) => {
  const estimate = await Estimate.findByPk(req.params.id, { include: [EstimateItem] });
  if (!estimate) return res.status(404).json({ error: 'Not found' });
  res.json(estimate);
});

router.post('/', requireAuth(), async (req, res) => {
  const created = await Estimate.create(req.body);
  res.json(created);
});

router.post('/:id/items', requireAuth(), async (req, res) => {
  const item = await EstimateItem.create({ ...req.body, estimateId: req.params.id });
  res.json(item);
});

router.post('/:id/send', requireAuth(), async (req, res) => {
  // placeholder: email sending would go here
  res.json({ sent: true });
});

router.post('/:id/approve', requireAuth(), async (req, res) => {
  const est = await Estimate.findByPk(req.params.id, { include: [EstimateItem] });
  if (!est) return res.status(404).json({ error: 'Not found' });

  await est.update({ 
    status: 'APPROVED', 
    signatureDataUrl: req.body?.signatureDataUrl || est.signatureDataUrl,
    signaturePngUrl: req.body?.signaturePngUrl || est.signaturePngUrl
  });

  // compute totals
  const items = (est.EstimateItems || []);
  const subtotal = items.reduce((s, it) => s + (parseFloat(it.qty||0) * parseFloat(it.unitPrice||0)), 0);
  const tax = subtotal * (parseFloat(est.taxRate||0)/100);
  const total = subtotal + tax;

  // create payment link
  const pay = await createPaymentLink(total, `Estimate #${est.id}`);

  // notify customer if contact provided
  if (est.customerEmail) {
    await sendEmail(est.customerEmail, `Estimate #${est.id} approved`, 
      `<p>Your estimate has been approved.</p><p>Total: <b>$${total.toFixed(2)}</b></p><p>Pay now: <a href="${pay.url}">${pay.url}</a></p>`);
  }
  if (est.customerPhone) {
    await sendSms(est.customerPhone, `Estimate #${est.id} approved. Pay: ${pay.url}`);
  }

  res.json({ ok: true, paymentLink: pay.url, total });
});

export default router;