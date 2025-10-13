
import express from 'express';
import { Estimate, EstimateItem } from '../models/index.js';
import { createPaymentLink } from '../utils/payments.js';

const router = express.Router();

router.get('/estimate/:id', async (req, res) => {
  const est = await Estimate.findByPk(req.params.id, { include: [EstimateItem] });
  if(!est) return res.status(404).send('Not found');
  const items = (est.EstimateItems || []).map(it => ({
    description: it.description, qty: it.qty, unitPrice: it.unitPrice, line: (parseFloat(it.qty||0)*parseFloat(it.unitPrice||0)).toFixed(2)
  }));
  const subtotal = items.reduce((s, it) => s + parseFloat(it.line), 0);
  const tax = subtotal * (parseFloat(est.taxRate||0)/100);
  const total = subtotal + tax;
  const pay = await createPaymentLink(total, `Estimate #${est.id}`);
  res.render('estimate', { 
    title: `Estimate #${est.id}`,
    id: est.id,
    status: est.status,
    taxRate: est.taxRate,
    items,
    subtotal: subtotal.toFixed(2),
    tax: tax.toFixed(2),
    total: total.toFixed(2),
    signed: !!est.signaturePngUrl,
    signatureUrl: est.signaturePngUrl,
    payUrl: pay.url
  });
});

router.post('/estimate/:id/approve', async (req, res) => {
  const est = await Estimate.findByPk(req.params.id);
  if(!est) return res.status(404).send('Not found');
  await est.update({ status: 'APPROVED' });
  const redirect = req.body.redirect || `/portal/estimate/${est.id}`;
  res.redirect(302, redirect);
});

export default router;
