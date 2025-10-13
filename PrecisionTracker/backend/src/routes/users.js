
import express from 'express';
import bcrypt from 'bcryptjs';
import { User } from '../models/index.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

router.get('/', requireAuth(['ADMIN']), async (req, res) => {
  const includeDeleted = String(req.query.includeDeleted||'') === '1';
  const where = includeDeleted ? undefined : { active: true };
  const users = await User.findAll({ where, order: [['id','DESC']] });
  res.json(users);
});

router.post('/', requireAuth(['ADMIN']), async (req, res) => {
  const { email, password, fullName, role } = req.body;
  const passwordHash = await bcrypt.hash(password || 'Welcome123!', 10);
  const user = await User.create({ email, fullName, role: role || 'TECH', passwordHash });
  res.json(user);
});

router.patch('/:id', requireAuth(['ADMIN']), async (req, res) => {
  const user = await User.findByPk(req.params.id);
  if(!user) return res.status(404).json({ error: 'Not found' });
  await user.update(req.body);
  res.json(user);
});

router.delete('/:id', requireAuth(['ADMIN']), async (req, res) => {
  const user = await User.findByPk(req.params.id);
  if(!user) return res.status(404).json({ error: 'Not found' });
  await user.update({ active: false });
  res.json({ ok: true });
});

export default router;
