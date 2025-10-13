import express from 'express';
import { Job, Customer, Jobsite, User, Task, ChangeOrder, CalendarEvent, Reminder, Invoice, Payment, Attachment } from '../models/index.js';
import { requireAuth } from '../middleware/auth.js';
import { sendEmail, sendPushNotification } from '../utils/notifier.js';

const router = express.Router();
const jobIncludes = [
  Customer,
  Jobsite,
  { model: User, as: 'assignedTech', attributes: ['id', 'fullName', 'email', 'role', 'pushToken'] },
];

const normalizeTags = (value) => {
  if (value === undefined) return undefined;
  const source = Array.isArray(value) ? value : String(value || '').split(',');
  return source
    .map(entry => (entry == null ? '' : String(entry).trim()))
    .filter(Boolean);
};

const normalizeActivityLog = (value) => {
  if (value === undefined) return undefined;
  const source = Array.isArray(value) ? value : [value];
  return source
    .map(item => {
      if (!item) return null;
      if (typeof item === 'string') {
        const note = item.trim();
        if (!note) return null;
        return { note, createdAt: new Date().toISOString() };
      }
      const note = (item.note || '').trim();
      if (!note) return null;
      return {
        note,
        createdAt: item.createdAt || new Date().toISOString(),
        author: item.author || null,
      };
    })
    .filter(Boolean);
};

const applyJobPayload = (payload = {}) => {
  const normalized = { ...payload };
  if (normalized.tags !== undefined) {
    normalized.tags = normalizeTags(normalized.tags);
  }
  if (normalized.activityLog !== undefined) {
    normalized.activityLog = normalizeActivityLog(normalized.activityLog);
  }
  return normalized;
};

const toPlainJob = (job) => (job ? job.get({ plain: true }) : null);

async function notifyAssignmentChange(previousAssignedTo, jobInstance) {
  const newAssignedTo = jobInstance.assignedTo;
  if (!newAssignedTo || newAssignedTo === previousAssignedTo) return;
  const tech = jobInstance.assignedTech || await User.findByPk(newAssignedTo);
  if (!tech) return;
  const jobName = jobInstance.name || `Job #${jobInstance.id}`;
  const customerName = jobInstance.Customer?.name || jobInstance.Customer?.email || 'customer';
  if (tech.email) {
    try {
      await sendEmail(
        tech.email,
        `New job assignment – ${jobName}`,
        `<p>Hi ${tech.fullName || tech.email},</p><p>You have been assigned to <strong>${jobName}</strong> for ${customerName}.</p><p>Check Precision Tracker for full details.</p>`
      );
    } catch (err) {
      console.warn('Assignment email failed', err?.message || err);
    }
  }
  if (tech.pushToken) {
    try {
      await sendPushNotification(
        tech.pushToken,
        'New job assignment',
        `${jobName} is now on your schedule.`,
        { jobId: jobInstance.id }
      );
    } catch (err) {
      console.warn('Assignment push failed', err?.message || err);
    }
  }
}

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
  res.json(items.map(toPlainJob));
});

router.get('/:id', requireAuth(), async (req, res) => {
  const job = await Job.findByPk(req.params.id, { include: jobIncludes });
  if (!job) return res.status(404).json({ error: 'Not found' });
  res.json(toPlainJob(job));
});

router.post('/', requireAuth(), async (req, res) => {
  const { estimateId, customerId, jobsiteId, customer, jobsite, ...rest } = req.body || {};
  const customerRecord = await ensureCustomer(customer);
  const finalCustomerId = customerRecord?.id ?? customerId ?? null;
  const jobsiteRecord = await ensureJobsite(jobsite, finalCustomerId);
  const finalJobsiteId = jobsiteRecord?.id ?? jobsiteId ?? null;
  const payload = applyJobPayload(rest);

  const created = await Job.create({
    ...payload,
    estimateId: estimateId ?? null,
    customerId: finalCustomerId,
    jobsiteId: finalJobsiteId,
  });
  const withRelations = await Job.findByPk(created.id, { include: jobIncludes });
  await notifyAssignmentChange(null, withRelations);
  res.json(toPlainJob(withRelations));
});

router.patch('/:id', requireAuth(), async (req, res) => {
  const job = await Job.findByPk(req.params.id);
  if (!job) return res.status(404).json({ error: 'Not found' });
  const { estimateId, customerId, jobsiteId, customer, jobsite, ...rest } = req.body || {};
  const customerRecord = await ensureCustomer(customer);
  const finalCustomerId = customerRecord?.id ?? customerId ?? job.customerId ?? null;
  const jobsiteRecord = await ensureJobsite(jobsite, finalCustomerId);
  const finalJobsiteId = jobsiteRecord?.id ?? jobsiteId ?? job.jobsiteId ?? null;
  const payload = applyJobPayload(rest);
  const previousAssignedTo = job.assignedTo;

  await job.update({
    ...payload,
    estimateId: estimateId ?? job.estimateId ?? null,
    customerId: finalCustomerId,
    jobsiteId: finalJobsiteId,
  });
  const updated = await Job.findByPk(job.id, { include: jobIncludes });
  await notifyAssignmentChange(previousAssignedTo, updated);
  res.json(toPlainJob(updated));
});

router.delete('/:id', requireAuth(), async (req, res) => {
  const job = await Job.findByPk(req.params.id);
  if (!job) return res.status(404).json({ error: 'Not found' });
  const invoices = await Invoice.findAll({ where: { jobId: job.id } });
  if (invoices.length) {
    const invoiceIds = invoices.map(inv => inv.id);
    await Payment.destroy({ where: { invoiceId: invoiceIds } });
    await Invoice.destroy({ where: { id: invoiceIds } });
  }
  await Task.destroy({ where: { jobId: job.id } });
  await ChangeOrder.destroy({ where: { jobId: job.id } });
  await CalendarEvent.destroy({ where: { jobId: job.id } });
  await Reminder.destroy({ where: { jobId: job.id } });
  await Attachment.destroy({ where: { entityType: 'JOB', entityId: job.id } });
  await job.destroy();
  res.json({ ok: true });
});

export default router;
