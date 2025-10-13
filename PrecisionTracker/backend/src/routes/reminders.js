import express from 'express';
import { Reminder, Job, Customer, Jobsite } from '../models/index.js';
import { requireAuth } from '../middleware/auth.js';
import { dispatchReminder } from '../workers/reminderWorker.js';

const router = express.Router();

router.get('/', requireAuth(), async (req, res) => {
  const where = {};
  if (req.query.status) where.status = req.query.status;
  if (req.query.jobId) where.jobId = req.query.jobId;
  const reminders = await Reminder.findAll({
    where,
    include: [{ model: Job, include: [Customer, Jobsite] }],
    order: [['scheduledFor', 'ASC']],
  });
  res.json(reminders);
});

router.post('/', requireAuth(), async (req, res) => {
  const { jobId, channel = 'EMAIL', template = 'FOLLOW_UP', scheduledFor, payload = {}, userId } = req.body || {};
  if (!scheduledFor) return res.status(400).json({ error: 'scheduledFor required' });
  const reminder = await Reminder.create({
    jobId: jobId || null,
    userId: userId || req.user.id || null,
    channel: channel.toUpperCase(),
    template: template.toUpperCase(),
    payload,
    scheduledFor,
    status: 'PENDING',
  });
  res.json(reminder);
});

router.patch('/:id', requireAuth(), async (req, res) => {
  const reminder = await Reminder.findByPk(req.params.id);
  if (!reminder) return res.status(404).json({ error: 'Not found' });
  await reminder.update(req.body);
  res.json(reminder);
});

router.post('/:id/send-now', requireAuth(), async (req, res) => {
  const reminder = await Reminder.findByPk(req.params.id);
  if (!reminder) return res.status(404).json({ error: 'Not found' });
  try {
    await dispatchReminder(reminder);
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to send reminder' });
  }
});

router.delete('/:id', requireAuth(), async (req, res) => {
  const reminder = await Reminder.findByPk(req.params.id);
  if (!reminder) return res.status(404).json({ error: 'Not found' });
  await reminder.update({ status: 'CANCELLED' });
  res.json({ ok: true });
});

export default router;
