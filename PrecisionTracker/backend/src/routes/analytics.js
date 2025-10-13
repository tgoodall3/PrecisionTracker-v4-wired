import express from 'express';
import { Op, fn, col, literal } from 'sequelize';
import { Invoice, Payment, Lead, Job } from '../models/index.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

router.get('/summary', requireAuth(), async (_req, res) => {
  const now = new Date();
  const sixMonthsAgo = new Date(now);
  sixMonthsAgo.setMonth(now.getMonth() - 5);
  sixMonthsAgo.setDate(1);

  const revenue = await Invoice.findAll({
    attributes: [
      [fn('strftime', '%Y-%m', col('issuedAt')), 'month'],
      [fn('sum', col('amount')), 'invoiced'],
    ],
    where: { issuedAt: { [Op.gte]: sixMonthsAgo } },
    group: [literal('strftime(\'%Y-%m\', issuedAt)')],
    order: [[literal('strftime(\'%Y-%m\', issuedAt)'), 'ASC']],
  });

  const payments = await Payment.findAll({
    attributes: [
      [fn('strftime', '%Y-%m', col('receivedAt')), 'month'],
      [fn('sum', col('amount')), 'received'],
    ],
    where: { receivedAt: { [Op.not]: null, [Op.gte]: sixMonthsAgo } },
    group: [literal('strftime(\'%Y-%m\', receivedAt)')],
    order: [[literal('strftime(\'%Y-%m\', receivedAt)'), 'ASC']],
  });

  const totalLeads = await Lead.count();
  const convertedLeads = await Lead.count({ where: { status: 'CONVERTED' } });
  const totalJobs = await Job.count();

  res.json({
    revenue,
    payments,
    conversion: {
      totalLeads,
      convertedLeads,
      conversionRate: totalLeads ? convertedLeads / totalLeads : 0,
      jobsCreated: totalJobs,
    },
  });
});

router.get('/aging', requireAuth(), async (_req, res) => {
  const invoices = await Invoice.findAll({ include: [Payment] });
  const today = new Date();
  const buckets = {
    current: [],
    thirty: [],
    sixty: [],
    ninetyPlus: [],
  };
  invoices.forEach(inv => {
    const payments = (inv.Payments || []).reduce((sum, p) => sum + Number(p.amount || 0), 0);
    const balance = Math.max(Number(inv.amount || 0) - payments, 0);
    if (balance <= 0) return;
    const due = inv.dueAt ? new Date(inv.dueAt) : null;
    const diff = due ? Math.floor((today - due) / (1000 * 60 * 60 * 24)) : 0;
    const entry = {
      id: inv.id,
      number: inv.number,
      jobId: inv.jobId,
      dueAt: inv.dueAt,
      balance: balance.toFixed(2),
      daysPastDue: diff,
    };
    if (!due || diff <= 0) buckets.current.push(entry);
    else if (diff <= 30) buckets.thirty.push(entry);
    else if (diff <= 60) buckets.sixty.push(entry);
    else buckets.ninetyPlus.push(entry);
  });
  res.json(buckets);
});

router.get('/profitability', requireAuth(['ADMIN']), async (_req, res) => {
  const invoices = await Invoice.findAll({ include: [Payment] });
  const payments = invoices.reduce((sum, inv) => {
    const collected = (inv.Payments || []).reduce((s, p) => s + Number(p.amount || 0), 0);
    return sum + collected;
  }, 0);
  const outstanding = invoices.reduce((sum, inv) => {
    const collected = (inv.Payments || []).reduce((s, p) => s + Number(p.amount || 0), 0);
    return sum + Math.max(Number(inv.amount || 0) - collected, 0);
  }, 0);
  res.json({
    collected: payments.toFixed(2),
    outstanding: outstanding.toFixed(2),
    marginEstimate: (payments * 0.35).toFixed(2), // placeholder margin estimate
  });
});

export default router;
