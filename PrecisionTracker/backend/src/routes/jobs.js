import express from 'express';
import { Job, Customer, Jobsite, User } from '../models/index.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();
const jobIncludes = [
  Customer,
  Jobsite,
  { model: User, as: 'assignedTech', attributes: ['id', 'fullName', 'email', 'role'] },
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
  if (hasAddress || payload.customerId) {
    return Jobsite.create(payload);
  }
  return null;
}

router.get('/', requireAuth(), async (_req, res) => {
  const items = await Job.findAll({ include: jobIncludes, order: [['id', 'DESC']] });
  res.json(items);
});

router.get('/:id', requireAuth(), async (req, res) => {
  const job = await Job.findByPk(req.params.id, { include: jobIncludes });
  if (!job) return res.status(404).json({ error: 'Not found' });
  res.json(job);
});

router.post('/', requireAuth(), async (req, res) => {
  const { estimateId, customerId, jobsiteId, customer, jobsite, ...rest } = req.body || {};
  const customerRecord = await ensureCustomer(customer);
  const finalCustomerId = customerRecord?.id ?? customerId ?? null;
  const jobsiteRecord = await ensureJobsite(jobsite, finalCustomerId);
  const finalJobsiteId = jobsiteRecord?.id ?? jobsiteId ?? null;

  const created = await Job.create({
    ...rest,
    estimateId: estimateId ?? null,
    customerId: finalCustomerId,
    jobsiteId: finalJobsiteId,
  });
  const withRelations = await Job.findByPk(created.id, { include: jobIncludes });
  res.json(withRelations);
});

router.patch('/:id', requireAuth(), async (req, res) => {
  const job = await Job.findByPk(req.params.id);
  if (!job) return res.status(404).json({ error: 'Not found' });
  const { estimateId, customerId, jobsiteId, customer, jobsite, ...rest } = req.body || {};
  const customerRecord = await ensureCustomer(customer);
  const finalCustomerId = customerRecord?.id ?? customerId ?? job.customerId ?? null;
  const jobsiteRecord = await ensureJobsite(jobsite, finalCustomerId);
  const finalJobsiteId = jobsiteRecord?.id ?? jobsiteId ?? job.jobsiteId ?? null;

  await job.update({
    ...rest,
    estimateId: estimateId ?? job.estimateId ?? null,
    customerId: finalCustomerId,
    jobsiteId: finalJobsiteId,
  });
  const updated = await Job.findByPk(job.id, { include: jobIncludes });
  res.json(updated);
});

router.delete('/:id', requireAuth(), async (req, res) => {
  const job = await Job.findByPk(req.params.id);
  if (!job) return res.status(404).json({ error: 'Not found' });
  await job.destroy();
  res.json({ ok: true });
});

export default router;
