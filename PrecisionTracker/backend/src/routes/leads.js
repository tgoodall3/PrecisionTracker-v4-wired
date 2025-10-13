import express from 'express';
import { Lead, Customer, Jobsite, Job, Estimate, EstimateItem, Attachment, sequelize } from '../models/index.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

const normalizeTags = (value) => {
  if (value === undefined) return undefined;
  const source = Array.isArray(value) ? value : String(value || '').split(',');
  return source
    .map(entry => (entry == null ? '' : String(entry).trim()))
    .filter(Boolean);
};

const toPlainLead = (lead) => (lead ? lead.get({ plain: true }) : null);

const jobIncludes = [
  Customer,
  Jobsite,
];

async function ensureCustomer(customer = {}) {
  if (!customer) return null;
  const { id, name, phone, email, billingAddress } = customer;
  let record = null;
  if (id) {
    record = await Customer.findByPk(id);
  }
  if (!record && email) {
    record = await Customer.findOne({ where: { email } });
  }
  if (record) {
    await record.update({
      name: name ?? record.name,
      phone: phone ?? record.phone,
      email: email ?? record.email,
      billingAddress: billingAddress ?? record.billingAddress,
    });
    return record;
  }
  if (name || email || phone) {
    return Customer.create({
      name: name || email || phone,
      phone,
      email,
      billingAddress: billingAddress || null,
    });
  }
  return null;
}

async function ensureJobsite(jobsite = {}, fallbackCustomerId = null) {
  if (!jobsite) return null;
  const { id, addressLine1, addressLine2, city, state, zip, customerId } = jobsite;
  const hasAddress =
    [addressLine1, addressLine2, city, state, zip].some(value => value && value.trim());
  const payload = {
    addressLine1: addressLine1 || '',
    addressLine2: addressLine2 || '',
    city: city || '',
    state: state || '',
    zip: zip || '',
    customerId: customerId || fallbackCustomerId || null,
  };
  let record = null;
  if (id) {
    record = await Jobsite.findByPk(id);
    if (record) {
      await record.update(payload);
      return record;
    }
  }
  if (hasAddress) {
    return Jobsite.create(payload);
  }
  return null;
}

router.get('/', requireAuth(), async (_req, res) => {
  const items = await Lead.findAll({ include: [Customer, Jobsite], order: [['id', 'DESC']] });
  res.json(items.map(toPlainLead));
});

router.get('/:id', requireAuth(), async (req, res) => {
  const lead = await Lead.findByPk(req.params.id, { include: [Customer, Jobsite] });
  if (!lead) return res.status(404).json({ error: 'Not found' });
  res.json(toPlainLead(lead));
});

router.post('/', requireAuth(), async (req, res) => {
  const { description, status = 'NEW', customer, jobsite, tags } = req.body || {};
  if (!description || !description.trim()) {
    return res.status(400).json({ error: 'Description required' });
  }
  const customerRecord = await ensureCustomer(customer);
  const jobsiteRecord = await ensureJobsite(jobsite, customerRecord?.id || null);
  const created = await Lead.create({
    description,
    status,
    customerId: customerRecord?.id ?? null,
    jobsiteId: jobsiteRecord?.id ?? null,
    tags: normalizeTags(tags),
  });
  const withRelations = await Lead.findByPk(created.id, { include: [Customer, Jobsite] });
  res.json(toPlainLead(withRelations));
});

router.patch('/:id', requireAuth(), async (req, res) => {
  const id = req.params.id;
  const lead = await Lead.findByPk(id);
  if (!lead) return res.status(404).json({ error: 'Not found' });

  const { description, status, customer, jobsite, tags } = req.body || {};
  const customerRecord = await ensureCustomer(customer);
  const jobsiteRecord = await ensureJobsite(jobsite, customerRecord?.id || lead.customerId || null);

  await lead.update({
    description: description ?? lead.description,
    status: status ?? lead.status,
    customerId: customerRecord?.id ?? lead.customerId ?? null,
    jobsiteId: jobsiteRecord?.id ?? lead.jobsiteId ?? null,
    ...(tags !== undefined ? { tags: normalizeTags(tags) } : {}),
  });

  const updated = await Lead.findByPk(id, { include: [Customer, Jobsite] });
  res.json(toPlainLead(updated));
});

router.delete('/:id', requireAuth(), async (req, res) => {
  const lead = await Lead.findByPk(req.params.id);
  if (!lead) return res.status(404).json({ error: 'Not found' });
  await sequelize.transaction(async (t) => {
    const estimates = await Estimate.findAll({ where: { leadId: lead.id }, transaction: t });
    if (estimates.length) {
      const estimateIds = estimates.map(est => est.id);
      await EstimateItem.destroy({ where: { estimateId: estimateIds }, transaction: t });
      await Estimate.destroy({ where: { id: estimateIds }, transaction: t });
    }
    await Attachment.destroy({ where: { entityType: 'LEAD', entityId: lead.id }, transaction: t });
    await lead.destroy({ transaction: t });
  });
  res.json({ ok: true });
});

router.post('/:id/convert', requireAuth(), async (req, res) => {
  const lead = await Lead.findByPk(req.params.id, { include: [Customer, Jobsite] });
  if (!lead) return res.status(404).json({ error: 'Not found' });

  const { status = 'NEW', name, notes, customer, jobsite, estimateId, tags } = req.body || {};

  const customerRecord = await ensureCustomer(customer || lead.Customer || {});
  const jobsiteRecord = await ensureJobsite(jobsite || lead.Jobsite || {}, customerRecord?.id || lead.customerId || null);

  const jobName =
    name ||
    (lead.description ? lead.description.split('\n')[0].slice(0, 120) : `Job from lead #${lead.id}`);

  const job = await Job.create({
    estimateId: estimateId ?? null,
    customerId: customerRecord?.id ?? lead.customerId ?? null,
    jobsiteId: jobsiteRecord?.id ?? lead.jobsiteId ?? null,
    name: jobName,
    status: status || 'NEW',
    notes: notes || lead.description || null,
    tags: Array.isArray(tags) ? tags : lead.tags || [],
  });

  await lead.update({
    status: 'CONVERTED',
    customerId: customerRecord?.id ?? lead.customerId ?? null,
    jobsiteId: jobsiteRecord?.id ?? lead.jobsiteId ?? null,
  });

  const withRelations = await Job.findByPk(job.id, { include: jobIncludes });

  res.json(withRelations ? withRelations.get({ plain: true }) : job.get({ plain: true }));
});

export default router;
