
import express from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { User } from '../models/index.js';
import { requireAuth } from '../middleware/auth.js';
import { sendEmail } from '../utils/notifier.js';

const router = express.Router();

router.get('/', requireAuth(['ADMIN']), async (req, res) => {
  const includeDeleted = String(req.query.includeDeleted||'') === '1';
  const where = includeDeleted ? undefined : { active: true };
  const users = await User.findAll({ where, order: [['id','DESC']] });
  res.json(users);
});

router.post('/me/push-token', requireAuth(), async (req, res) => {
  const token = req.body?.pushToken;
  if (!token) return res.status(400).json({ error: 'pushToken required' });
  const user = await User.findByPk(req.user.id);
  if (!user) return res.status(404).json({ error: 'Not found' });
  await user.update({ pushToken: token });
  res.json({ ok: true });
});

router.post('/', requireAuth(['ADMIN']), async (req, res) => {
  const emailRaw = req.body?.email;
  const { password, fullName, role } = req.body || {};
  const email = typeof emailRaw === 'string' ? emailRaw.trim().toLowerCase() : '';
  if (!email) return res.status(400).json({ error: 'Email required' });

  const existing = await User.findOne({ where: { email } });
  if (existing) return res.status(409).json({ error: 'User already exists' });

  const tempPassword = typeof password === 'string' && password.trim().length >= 6
    ? password.trim()
    : crypto.randomBytes(6).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 10) || 'Welcome123!';

  const passwordHash = await bcrypt.hash(tempPassword, 10);
  const user = await User.create({ email, fullName, role: role || 'TECH', passwordHash });

  let invitation = { sent: false, mock: true };
  try {
    const subject = 'You’ve been invited to Precision Tracker';
    const appUrl = process.env.APP_URL || 'https://precisiontracker.app/login';
    const greeting = fullName ? `Hi ${fullName},` : 'Hi there,';
    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2933;">
        <p>${greeting}</p>
        <p>You now have access to Precision Tracker. Sign in with the details below:</p>
        <ul style="padding-left: 16px;">
          <li><strong>Email:</strong> ${email}</li>
          <li><strong>Temporary password:</strong> ${tempPassword}</li>
        </ul>
        <p>Head over to <a href="${appUrl}" target="_blank" rel="noopener noreferrer">${appUrl}</a> to get started. You'll be prompted to change your password after your first login.</p>
        <p style="margin-top: 24px;">— The Precision Tracker Team</p>
      </div>
    `;
    invitation = await sendEmail(email, subject, html);
  } catch (error) {
    invitation = { sent: false, error: error.message || 'Email failed' };
  }

  res.json({ ...user.toJSON(), invitation, temporaryPassword: tempPassword });
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
