import express from 'express';
import PDFDocument from 'pdfkit';
import { Estimate, EstimateItem } from '../models/index.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

router.get('/estimate/:id', requireAuth(), async (req, res) => {
  const est = await Estimate.findByPk(req.params.id, { include: [EstimateItem] });
  if(!est) return res.status(404).json({ error: 'Not found' });
  res.setHeader('Content-Type', 'application/pdf');
  const doc = new PDFDocument({ margin: 50 });
  doc.pipe(res);
  doc.fontSize(20).text(`Estimate #${est.id}`, { align: 'right' });
  doc.moveDown();
  doc.fontSize(12).text(`Status: ${est.status}`);
  doc.moveDown();
  doc.text('Line Items:');
  doc.moveDown(0.5);
  let subtotal = 0;
  (est.EstimateItems || []).forEach((it) => {
    const line = (parseFloat(it.qty||0) * parseFloat(it.unitPrice||0));
    subtotal += line;
    doc.text(`- ${it.description}  |  ${it.qty} × $${it.unitPrice} = $${line.toFixed(2)}`);
  });
  const tax = subtotal * (parseFloat(est.taxRate||0)/100);
  const total = subtotal + tax;
  doc.moveDown();
  doc.text(`Subtotal: $${subtotal.toFixed(2)}`);
  doc.text(`Tax (${est.taxRate}%): $${tax.toFixed(2)}`);
  doc.fontSize(16).text(`Total: $${total.toFixed(2)}`, { align: 'right' });
  doc.moveDown(2);
  doc.fontSize(12).text('Signature:', { continued: true });
  if(est.signatureDataUrl){
    const base64 = est.signatureDataUrl.split(',')[1];
    const img = Buffer.from(base64, 'base64');
    doc.image(img, { width: 200 });
  } else {
    doc.text(' ___________________________');
  }
  doc.end();
});

export default router;
