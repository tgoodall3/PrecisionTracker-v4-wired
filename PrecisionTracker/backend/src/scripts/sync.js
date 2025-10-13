import 'dotenv/config';
import { sequelize, User } from '../models/index.js';
import bcrypt from 'bcryptjs';

async function main() {
  await sequelize.sync({ alter: true });
  console.log('DB synced');
  // seed an admin if none
  const count = await User.count();
  if (!count) {
    const passwordHash = await bcrypt.hash('password123', 10);
    await User.create({ email: 'admin@example.com', fullName: 'Admin', passwordHash, role: 'ADMIN' });
    console.log('Seeded admin: admin@example.com / password123');
  }
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });