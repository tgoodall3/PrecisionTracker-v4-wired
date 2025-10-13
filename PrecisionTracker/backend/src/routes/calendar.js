
import express from 'express';
import { CalendarEvent } from '../models/index.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

router.get('/', requireAuth(), async (req, res) => {
  const where = {};
  if (req.query.jobId) where.jobId = req.query.jobId;
  const items = await CalendarEvent.findAll({ where, order: [['startAt', 'ASC']] });
  res.json(items);
});

router.post('/', requireAuth(['ADMIN','SUPERVISOR']), async (req, res) => {
  const created = await CalendarEvent.create(req.body);
  res.json(created);
});

router.patch('/:id', requireAuth(['ADMIN','SUPERVISOR']), async (req, res) => {
  const ev = await CalendarEvent.findByPk(req.params.id);
  if(!ev) return res.status(404).json({ error: 'Not found' });
  await ev.update(req.body);
  res.json(ev);
});

router.delete('/:id', requireAuth(['ADMIN','SUPERVISOR']), async (req, res) => {
  const ev = await CalendarEvent.findByPk(req.params.id);
  if (!ev) return res.status(404).json({ error: 'Not found' });
  await ev.destroy();
  res.json({ ok: true });
});

export default router;
