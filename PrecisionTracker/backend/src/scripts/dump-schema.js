import sqlite3 from 'sqlite3';

const dbPath = process.env.DB_STORAGE || './data/dev.sqlite';
const tables = [
  'customers',
  'jobsites',
  'leads',
  'estimates',
  'estimate_items',
  'jobs',
  'tasks',
  'invoices',
  'payments',
  'change_orders',
  'calendar_events',
  'reminders',
];

const db = new sqlite3.Database(dbPath);

const exec = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });

async function main() {
  try {
    await exec('PRAGMA foreign_keys = ON;');
    const pragma = await exec('PRAGMA foreign_keys;');
    console.log('PRAGMA foreign_keys =>', pragma[0]);
    for (const table of tables) {
      const [{ sql } = { sql: null }] = await exec(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name=?",
        [table]
      );
      console.log(`\n${table}:`);
      console.log(sql || 'not found');
    }
  } catch (error) {
    console.error('Schema dump failed:', error);
  } finally {
    db.close();
  }
}

main();
