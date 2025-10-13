import { DataTypes } from 'sequelize';
import { sequelize } from '../models/index.js';

export async function ensureSchema() {
  const qi = sequelize.getQueryInterface();
  const dialect = sequelize.getDialect();
  try {
    const jobs = await qi.describeTable('jobs');
    if (!jobs.assignedTo) {
      await qi.addColumn('jobs', 'assignedTo', { type: DataTypes.INTEGER, allowNull: true });
    }
    if (!jobs.tags) {
      await qi.addColumn('jobs', 'tags', { type: DataTypes.TEXT, allowNull: true });
    }
    if (!jobs.activityLog) {
      await qi.addColumn('jobs', 'activityLog', { type: DataTypes.TEXT, allowNull: true });
    }
  } catch (e) {
    console.warn('schema check failed', e?.message || e);
  }
  try {
    const leads = await qi.describeTable('leads');
    if (!leads.tags) {
      await qi.addColumn('leads', 'tags', { type: DataTypes.TEXT, allowNull: true });
    }
  } catch (e) {
    console.warn('schema check failed (leads)', e?.message || e);
  }
  try {
    const users = await qi.describeTable('users');
    if (!users.pushToken) {
      await qi.addColumn('users', 'pushToken', { type: DataTypes.STRING, allowNull: true });
    }
  } catch (e) {
    console.warn('schema check failed (users)', e?.message || e);
  }
  try {
    await qi.describeTable('reminders');
  } catch (e) {
    await qi.createTable('reminders', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      jobId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'jobs', key: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      userId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
      },
      channel: { type: DataTypes.ENUM('EMAIL','SMS','PUSH'), allowNull: false, defaultValue: 'EMAIL' },
      template: { type: DataTypes.STRING, allowNull: false },
      payload: { type: DataTypes.JSON, allowNull: true },
      scheduledFor: { type: DataTypes.DATE, allowNull: false },
      status: { type: DataTypes.ENUM('PENDING','SENT','CANCELLED','FAILED'), defaultValue: 'PENDING' },
      lastError: { type: DataTypes.TEXT, allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: sequelize.literal('CURRENT_TIMESTAMP') },
      updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: sequelize.literal('CURRENT_TIMESTAMP') }
    });
  }
  if (dialect !== 'sqlite') {
    try {
      await qi.changeColumn('jobs', 'status', {
        type: DataTypes.ENUM('NEW','SCHEDULED','IN_PROGRESS','ON_HOLD','COMPLETED','DONE','PAID','CLOSED'),
        defaultValue: 'SCHEDULED'
      });
    } catch (e) {
      console.warn('enum update failed (jobs.status)', e?.message || e);
    }
    try {
      await qi.changeColumn('leads', 'status', {
        type: DataTypes.ENUM('NEW','CONTACTED','ESTIMATING','CLOSED_LOST','CONVERTED'),
        defaultValue: 'NEW'
      });
    } catch (e) {
      console.warn('enum update failed (leads.status)', e?.message || e);
    }
  }
}
