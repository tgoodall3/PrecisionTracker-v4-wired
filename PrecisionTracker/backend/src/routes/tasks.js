import express from 'express';
import { Task, User } from '../models/index.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

router.get('/', requireAuth(), async (req, res) => {
  const where = {};
  if (req.query.jobId) where.jobId = req.query.jobId;
  const items = await Task.findAll({
    where,
    include: [{ model: User, as: 'assignee', attributes: ['id','fullName','email','role'] }],
    order: [['id','DESC']],
  });
  res.json(items);
});

router.post('/', requireAuth(), async (req, res) => {
  const created = await Task.create(req.body);
  const withAssignee = await Task.findByPk(created.id, {
    include: [{ model: User, as: 'assignee', attributes: ['id','fullName','email','role'] }],
  });
  res.json(withAssignee);
});

router.patch('/:id', requireAuth(), async (req, res) => {
  const t = await Task.findByPk(req.params.id);
  if (!t) return res.status(404).json({ error: 'Not found' });
  await t.update(req.body);
  const withAssignee = await Task.findByPk(t.id, {
    include: [{ model: User, as: 'assignee', attributes: ['id','fullName','email','role'] }],
  });
  res.json(withAssignee);
});

router.delete('/:id', requireAuth(), async (req, res) => {
  const t = await Task.findByPk(req.params.id);
  if (!t) return res.status(404).json({ error: 'Not found' });
  await t.destroy();
  res.json({ ok: true });
});

export default router;
