import express from 'express';
import PDFDocument from 'pdfkit';
import { Estimate, EstimateItem, Invoice, Payment, Job, Customer, Jobsite } from '../models/index.js';
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

router.get('/invoice/:id', requireAuth(), async (req, res) => {
  const invoice = await Invoice.findByPk(req.params.id, {
    include: [
      Payment,
      {
        model: Job,
        include: [Customer, Jobsite],
      },
    ],
  });
  if (!invoice) return res.status(404).json({ error: 'Not found' });

  const number = invoice.number || invoice.id;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="invoice-${String(number)}.pdf"`);

  const doc = new PDFDocument({ margin: 56 });
  doc.pipe(res);

  const currency = (value) => `$${Number(value || 0).toFixed(2)}`;
  const formatDate = (value) => {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  doc
    .fontSize(26)
    .text('Invoice', { align: 'right' })
    .moveDown()
    .fontSize(12);

  doc.text(`Invoice #: ${number}`);
  doc.text(`Status: ${invoice.status || 'DRAFT'}`);
  doc.text(`Issued: ${formatDate(invoice.issuedAt)}`);
  doc.text(`Due: ${formatDate(invoice.dueAt)}`);

  const job = invoice.Job;
  const customer = job?.Customer;
  const jobsite = job?.Jobsite;

  doc.moveDown();
  doc.fontSize(14).text('Billing Summary', { underline: true });
  doc.fontSize(12);
  doc.text(`Amount: ${currency(invoice.amount)}`);
  const payments = Array.isArray(invoice.Payments) ? invoice.Payments : [];
  const paid = payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const balance = Math.max(Number(invoice.amount || 0) - paid, 0);
  doc.text(`Collected: ${currency(paid)}`);
  doc.text(`Balance due: ${currency(balance)}`);

  if (customer || jobsite || job) {
    doc.moveDown();
    doc.fontSize(14).text('Job Details', { underline: true });
    doc.fontSize(12);
    if (job?.name) doc.text(`Job: ${job.name}`);
    if (customer?.name) doc.text(`Customer: ${customer.name}`);
    if (jobsite) {
      const parts = [
        jobsite.addressLine1,
        jobsite.addressLine2,
        [jobsite.city, jobsite.state, jobsite.zip].filter(Boolean).join(', '),
      ]
        .filter(Boolean)
        .join('\n');
      if (parts) {
        doc.text('Jobsite:');
        doc.text(parts, { indent: 16 });
      }
    }
  }

  doc.moveDown();
  doc.fontSize(14).text('Payments', { underline: true });
  doc.fontSize(12);
  if (payments.length === 0) {
    doc.text('No payments recorded yet.');
  } else {
    payments
      .sort((a, b) => {
        const aDate = new Date(a.receivedAt || 0).getTime();
        const bDate = new Date(b.receivedAt || 0).getTime();
        return aDate - bDate;
      })
      .forEach((payment, index) => {
        doc.text(
          `${index + 1}. ${formatDate(payment.receivedAt)} – ${currency(payment.amount)} (${payment.method || 'OTHER'})`
        );
      });
  }

  doc.moveDown(1.5);
  doc.text('Notes:', { continued: true }).text(' ________________________________');
  doc.moveDown(1);
  doc.text('Signature:', { continued: true }).text(' ________________________________');

  doc.end();
});

export default router;
