import express from 'express';
import { Invoice, Payment } from '../models/index.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

router.get('/', requireAuth(), async (req, res) => {
  const invoices = await Invoice.findAll({
    include: [Payment],
    order: [['issuedAt', 'DESC'], ['createdAt', 'DESC']],
  });
  res.json(invoices);
});

router.get('/summary', requireAuth(), async (req, res) => {
  const invoices = await Invoice.findAll({ include: [Payment] });
  const summary = {
    totalAmount: 0,
    collected: 0,
    outstanding: 0,
    draftAmount: 0,
    overdueCount: 0,
    dueSoonCount: 0,
    partPaidCount: 0,
    paidCount: 0,
    totalCount: invoices.length,
  };
  const today = new Date();
  invoices.forEach(inv => {
    const amount = Number(inv.amount || 0);
    const payments = (inv.Payments || []).reduce((sum, p) => sum + Number(p.amount || 0), 0);
    const balance = Math.max(amount - payments, 0);
    summary.totalAmount += amount;
    summary.collected += payments;
    const status = inv.status || 'DRAFT';
    if (status === 'PAID') {
      summary.paidCount += 1;
    }
    if (status === 'PART_PAID') {
      summary.partPaidCount += 1;
    }
    if (status === 'DRAFT') {
      summary.draftAmount += amount;
    }
    if (!['PAID', 'VOID'].includes(status)) {
      summary.outstanding += balance;
      if (inv.dueAt && balance > 0) {
        const due = new Date(inv.dueAt);
        if (!Number.isNaN(due.getTime())) {
          const diffDays = Math.ceil((due - today) / (1000 * 60 * 60 * 24));
          if (diffDays < 0) summary.overdueCount += 1;
          else if (diffDays <= 7) summary.dueSoonCount += 1;
        }
      }
    }
  });
  res.json(summary);
});

router.get('/export/csv', requireAuth(), async (_req, res) => {
  const invoices = await Invoice.findAll({ include: [Payment], order: [['issuedAt', 'DESC']] });
  const headers = ['Invoice Number', 'Job ID', 'Status', 'Issued At', 'Due At', 'Amount', 'Collected', 'Outstanding'];
  const rows = invoices.map(inv => {
    const payments = (inv.Payments || []).reduce((sum, p) => sum + Number(p.amount || 0), 0);
    const balance = Math.max(Number(inv.amount || 0) - payments, 0);
    return [
      inv.number,
      inv.jobId ?? '',
      inv.status ?? 'DRAFT',
      inv.issuedAt || '',
      inv.dueAt || '',
      Number(inv.amount || 0).toFixed(2),
      payments.toFixed(2),
      balance.toFixed(2),
    ];
  });
  const csv = [headers, ...rows].map(line => line.map(value => `"${String(value ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="invoices.csv"');
  res.send(csv);
});

router.get('/export/quickbooks', requireAuth(), async (_req, res) => {
  const invoices = await Invoice.findAll({ include: [Payment], order: [['issuedAt', 'DESC']] });
  const header = '!TRNS\tTRNSID\tTRNSTYPE\tDATE\tACCNT\tAMOUNT\tNAME\tMEMO\n!SPL\tSPLID\tTRNSTYPE\tDATE\tACCNT\tAMOUNT\tNAME\tMEMO\n!ENDTRNS';
  const lines = [header];
  invoices.forEach(inv => {
    const date = inv.issuedAt ? new Date(inv.issuedAt).toLocaleDateString('en-US') : '';
    const memo = `Invoice ${inv.number}`;
    lines.push([
      'TRNS',
      inv.id,
      'INVOICE',
      date,
      'Accounts Receivable',
      Number(inv.amount || 0).toFixed(2),
      inv.jobId || '',
      memo,
    ].join('\t'));
    lines.push([
      'SPL',
      inv.id,
      'INVOICE',
      date,
      'Income',
      (-Number(inv.amount || 0)).toFixed(2),
      inv.jobId || '',
      memo,
    ].join('\t'));
    lines.push('ENDTRNS');
  });
  const payload = lines.join('\n');
  res.setHeader('Content-Type', 'text/plain');
  res.setHeader('Content-Disposition', 'attachment; filename="invoices.iif"');
  res.send(payload);
});

router.post('/', requireAuth(), async (req, res) => {
  const payload = { ...req.body };
  let number = payload.number ? String(payload.number).trim() : '';

  if (!number) {
    const latestId = await Invoice.max('id');
    let counter = (latestId || 0) + 1;
    let candidate = `INV-${String(counter).padStart(4, '0')}`;

    // ensure uniqueness in case numbers were customized
    let exists = await Invoice.findOne({ where: { number: candidate } });
    while (exists) {
      counter += 1;
      candidate = `INV-${String(counter).padStart(4, '0')}`;
      exists = await Invoice.findOne({ where: { number: candidate } });
    }
    number = candidate;
  }

  payload.number = number;

  const created = await Invoice.create(payload);
  res.json(created);
});

router.post('/:id/payments', requireAuth(), async (req, res) => {
  const payment = await Payment.create({ ...req.body, invoiceId: req.params.id });
  res.json(payment);
});

router.delete('/:id', requireAuth(), async (req, res) => {
  const invoice = await Invoice.findByPk(req.params.id);
  if (!invoice) return res.status(404).json({ error: 'Not found' });
  await Payment.destroy({ where: { invoiceId: invoice.id } });
  await invoice.destroy();
  res.json({ ok: true });
});

export default router;
