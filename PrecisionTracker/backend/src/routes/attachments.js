import express from 'express';
import { Attachment, User } from '../models/index.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

router.get('/', requireAuth(), async (req, res) => {
  const { entityType, entityId } = req.query || {};
  const where = {};
  if (entityType) where.entityType = String(entityType).toUpperCase();
  if (entityId) where.entityId = entityId;
  const attachments = await Attachment.findAll({
    where,
    include: [{ model: User, as: 'uploader', attributes: ['id', 'fullName', 'email', 'role'] }],
    order: [['createdAt', 'DESC']],
  });
  res.json(attachments.map(item => item.get({ plain: true })));
});

router.post('/', requireAuth(), async (req, res) => {
  const { entityType, entityId, fileUrl, caption } = req.body || {};
  if (!entityType || !entityId || !fileUrl) {
    return res.status(400).json({ error: 'entityType, entityId, and fileUrl are required' });
  }
  const record = await Attachment.create({
    entityType: String(entityType).toUpperCase(),
    entityId,
    fileUrl,
    caption: caption || null,
    uploadedBy: req.user?.id || null,
  });
  const withUploader = await Attachment.findByPk(record.id, {
    include: [{ model: User, as: 'uploader', attributes: ['id', 'fullName', 'email', 'role'] }],
  });
  res.json(withUploader ? withUploader.get({ plain: true }) : record.get({ plain: true }));
});

router.delete('/:id', requireAuth(), async (req, res) => {
  const attachment = await Attachment.findByPk(req.params.id);
  if (!attachment) return res.status(404).json({ error: 'Not found' });
  await attachment.destroy();
  res.json({ ok: true });
});

export default router;
