import express from 'express';
import { Lead, Customer, Jobsite } from '../models/index.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

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
  res.json(items);
});

router.get('/:id', requireAuth(), async (req, res) => {
  const lead = await Lead.findByPk(req.params.id, { include: [Customer, Jobsite] });
  if (!lead) return res.status(404).json({ error: 'Not found' });
  res.json(lead);
});

router.post('/', requireAuth(), async (req, res) => {
  const { description, status = 'NEW', customer, jobsite } = req.body || {};
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
  });
  const withRelations = await Lead.findByPk(created.id, { include: [Customer, Jobsite] });
  res.json(withRelations);
});

router.patch('/:id', requireAuth(), async (req, res) => {
  const id = req.params.id;
  const lead = await Lead.findByPk(id);
  if (!lead) return res.status(404).json({ error: 'Not found' });

  const { description, status, customer, jobsite } = req.body || {};
  const customerRecord = await ensureCustomer(customer);
  const jobsiteRecord = await ensureJobsite(jobsite, customerRecord?.id || lead.customerId || null);

  await lead.update({
    description: description ?? lead.description,
    status: status ?? lead.status,
    customerId: customerRecord?.id ?? lead.customerId ?? null,
    jobsiteId: jobsiteRecord?.id ?? lead.jobsiteId ?? null,
  });

  const updated = await Lead.findByPk(id, { include: [Customer, Jobsite] });
  res.json(updated);
});

router.delete('/:id', requireAuth(), async (req, res) => {
  const lead = await Lead.findByPk(req.params.id);
  if (!lead) return res.status(404).json({ error: 'Not found' });
  await lead.destroy();
  res.json({ ok: true });
});

export default router;
