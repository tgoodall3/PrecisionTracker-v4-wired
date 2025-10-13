import { DataTypes } from 'sequelize';
import { sequelize } from '../models/index.js';

export async function ensureSchema() {
  const qi = sequelize.getQueryInterface();
  try {
    const jobs = await qi.describeTable('jobs');
    if (!jobs.assignedTo) {
      await qi.addColumn('jobs', 'assignedTo', { type: DataTypes.INTEGER, allowNull: true });
    }
  } catch (e) {
    console.warn('schema check failed', e?.message || e);
  }
}
