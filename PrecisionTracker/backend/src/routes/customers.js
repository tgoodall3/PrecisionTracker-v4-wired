import express from 'express';
import { Customer } from '../models/index.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

router.get('/', requireAuth(), async (req, res) => {
  const q = req.query.q;
  const where = q ? { name: { ['like']: `%${q}%` } } : undefined;
  const items = await Customer.findAll({ where, order: [['id', 'DESC']] });
  res.json(items);
});

router.post('/', requireAuth(), async (req, res) => {
  const created = await Customer.create(req.body);
  res.json(created);
});

export default router;