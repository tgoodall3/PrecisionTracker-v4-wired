import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { body, validationResult } from 'express-validator';
import { User } from '../models/index.js';

const router = express.Router();

router.post('/register', 
  body('email').isEmail(),
  body('password').isLength({ min: 6 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const { email, password, fullName, role } = req.body;
    const existing = await User.findOne({ where: { email } });
    if (existing) return res.status(409).json({ error: 'User exists' });
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({ email, fullName, passwordHash, role: role || 'ADMIN' });
    res.json({ id: user.id, email: user.email });
});

// quick health check (GET)
router.get('/health', (req, res) => res.json({ ok: true, scope: 'auth' }));

// // LOGIN (POST /auth/login)
// router.post('/login', async (req, res, next) => {
//   try {
//     const { email, password } = req.body || {};
//     if (!email || !password) return res.status(400).json({ error: 'missing email or password' });

//     const user = await User.findOne({ where: { email } });
//     if (!user) return res.status(401).json({ error: 'invalid' });

//     const ok = bcrypt.compareSync(password, user.passwordHash || '');
//     if (!ok) return res.status(401).json({ error: 'invalid' });

//     const token = jwt.sign(
//       { id: user.id, role: user.role, email: user.email },
//       process.env.JWT_SECRET || 'dev_secret',
//       { expiresIn: '7d' }
//     );

//     res.json({ token, user: { id: user.id, name: user.name, role: user.role, email: user.email } });
//   } catch (e) {
//     next(e);
//   }
// });
// export default router;

router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};

  // Temporary bypass login for development
  if (email === 'admin@example.com' && password === 'test123') {
    return res.json({
      success: true,
      message: '✅ Login successful!',
      token: jwt.sign({ id: 1, role: 'ADMIN', email }, process.env.JWT_SECRET || 'dev_secret', { expiresIn: '7d' }),
      user: {
        id: 1,
        name: 'Admin User',
        role: 'ADMIN',
        email: email
      }
    });
  }

  // Optional extra test account
  if (email === 'user@example.com' && password === 'test123') {
    return res.json({
      success: true,
      message: '✅ User login successful!',
      token: jwt.sign({ id: 2, role: 'ESTIMATOR', email }, process.env.JWT_SECRET || 'dev_secret', { expiresIn: '7d' }),
      user: {
        id: 2,
        name: 'Standard User',
        role: 'ESTIMATOR',
        email: email
      }
    });
  }

  return res.status(401).json({
    success: false,
    message: '❌ Invalid email or password.'
  });
});
export default router;

