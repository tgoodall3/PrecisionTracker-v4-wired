import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { saveBase64Image } from '../utils/storage.js';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();

router.post('/image', requireAuth(), async (req, res) => {
  const { dataUrl } = req.body;
  if(!dataUrl) return res.status(400).json({ error: 'dataUrl required' });
  const url = saveBase64Image(dataUrl, uuidv4() + '.png');
  res.json({ url });
});

export default router;