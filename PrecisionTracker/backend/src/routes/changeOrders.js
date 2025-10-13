
import express from 'express';
import { ChangeOrder } from '../models/index.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

router.get('/job/:jobId', requireAuth(), async (req, res) => {
  const items = await ChangeOrder.findAll({ where: { jobId: req.params.jobId }, order: [['id','DESC']] });
  res.json(items);
});

router.post('/job/:jobId', requireAuth(['ADMIN','SUPERVISOR','ESTIMATOR']), async (req, res) => {
  const created = await ChangeOrder.create({ ...req.body, jobId: req.params.jobId });
  res.json(created);
});

router.patch('/:id', requireAuth(['ADMIN','SUPERVISOR','ESTIMATOR']), async (req, res) => {
  const co = await ChangeOrder.findByPk(req.params.id);
  if(!co) return res.status(404).json({ error: 'Not found' });
  await co.update(req.body);
  res.json(co);
});

export default router;
