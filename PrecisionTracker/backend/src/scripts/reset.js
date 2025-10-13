import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import bcrypt from 'bcryptjs';

const dialect = process.env.DB_DIALECT || 'sqlite';
const storageRelative = process.env.DB_STORAGE || './data/dev.sqlite';
const storagePath = path.resolve(process.cwd(), storageRelative);

async function removeSqliteFile() {
  if (dialect !== 'sqlite') {
    return;
  }
  try {
    await fs.mkdir(path.dirname(storagePath), { recursive: true });
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      try {
        await fs.unlink(storagePath);
        console.log(`Removed existing SQLite file at ${storagePath}`);
        break;
      } catch (error) {
        if (error.code === 'ENOENT') {
          console.log('No existing SQLite file to remove.');
          break;
        }
        if (error.code === 'EBUSY' || error.code === 'EPERM') {
          if (attempt === 5) {
            throw new Error(
              `SQLite file is locked (attempt ${attempt}). Stop any running dev server or close DB viewers and try again.`
            );
          }
          console.warn(`SQLite file busy (attempt ${attempt}/5), retrying...`);
          await new Promise((resolve) => setTimeout(resolve, 750));
          continue;
        }
        throw error;
      }
    }
  } catch (error) {
    throw error;
  }
}

async function rebuild() {
  if (dialect !== 'sqlite') {
    console.log('Non-SQLite dialect detected, proceeding without deleting storage file.');
  }

  await removeSqliteFile();

  const { sequelize, User } = await import('../models/index.js');

  await sequelize.sync({ force: true });
  console.log('Database schema recreated.');

  const adminCount = await User.count();
  if (!adminCount) {
    const passwordHash = await bcrypt.hash('password123', 10);
    await User.create({
      email: 'admin@example.com',
      fullName: 'Admin',
      role: 'ADMIN',
      passwordHash,
    });
    console.log('Seeded default admin: admin@example.com / password123');
  }

  await sequelize.close();
  console.log('Reset complete.');
}

rebuild().catch((error) => {
  console.error('Database reset failed:', error);
  process.exit(1);
});
