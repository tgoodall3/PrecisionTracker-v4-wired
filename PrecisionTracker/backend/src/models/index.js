import { Sequelize, DataTypes } from 'sequelize';

const dialect = process.env.DB_DIALECT || 'sqlite';
let sequelize;
if (dialect === 'sqlite') {
  sequelize = new Sequelize({
    dialect,
    storage: process.env.DB_STORAGE || './data/dev.sqlite',
    logging: false,
    pool: {
      max: 1,
      min: 0,
      idle: 10000,
      acquire: 60000,
    },
    dialectOptions: {
      busyTimeout: +(process.env.SQLITE_BUSY_TIMEOUT || 60000),
    },
    retry: {
      match: [/SQLITE_BUSY/],
      max: 5,
    },
  });
  sequelize.addHook('afterConnect', (connection) => new Promise((resolve, reject) => {
    connection.run('PRAGMA foreign_keys = ON', (err) => {
      if (err) return reject(err);
      return resolve();
    });
  }));
} else {
  sequelize = new Sequelize(process.env.DB_NAME, process.env.DB_USER, process.env.DB_PASS, {
    host: process.env.DB_HOST || 'localhost',
    port: +(process.env.DB_PORT || 3306),
    dialect,
    logging: false
  });
}

// Models
import UserModel from './user.js';
import CustomerModel from './customer.js';
import JobsiteModel from './jobsite.js';
import LeadModel from './lead.js';
import EstimateModel from './estimate.js';
import EstimateItemModel from './estimateItem.js';
import JobModel from './job.js';
import TaskModel from './task.js';
import InvoiceModel from './invoice.js';
import PaymentModel from './payment.js';
import AttachmentModel from './attachment.js';
import ChangeOrderModel from './changeOrder.js';
import CalendarEventModel from './calendarEvent.js';
import ReminderModel from './reminder.js';

export const User = UserModel(sequelize, DataTypes);
export const Customer = CustomerModel(sequelize, DataTypes);
export const Jobsite = JobsiteModel(sequelize, DataTypes);
export const Lead = LeadModel(sequelize, DataTypes);
export const Estimate = EstimateModel(sequelize, DataTypes);
export const EstimateItem = EstimateItemModel(sequelize, DataTypes);
export const Job = JobModel(sequelize, DataTypes);
export const Task = TaskModel(sequelize, DataTypes);
export const Invoice = InvoiceModel(sequelize, DataTypes);
export const Payment = PaymentModel(sequelize, DataTypes);
export const Attachment = AttachmentModel(sequelize, DataTypes);
export const ChangeOrder = ChangeOrderModel(sequelize, DataTypes);
export const CalendarEvent = CalendarEventModel(sequelize, DataTypes);
export const Reminder = ReminderModel(sequelize, DataTypes);

// Associations
Customer.hasMany(Jobsite, {
  foreignKey: { name: 'customerId', allowNull: false },
  onDelete: 'CASCADE',
  hooks: true,
});
Jobsite.belongsTo(Customer, {
  foreignKey: { name: 'customerId', allowNull: false },
  onDelete: 'CASCADE',
});

Customer.hasMany(Lead, {
  foreignKey: { name: 'customerId', allowNull: true },
  onDelete: 'SET NULL',
  hooks: true,
});
Lead.belongsTo(Customer, {
  foreignKey: { name: 'customerId', allowNull: true },
  onDelete: 'SET NULL',
});
Lead.belongsTo(Jobsite, {
  foreignKey: { name: 'jobsiteId', allowNull: true },
  onDelete: 'SET NULL',
});

Estimate.belongsTo(Lead, {
  foreignKey: { name: 'leadId', allowNull: true },
  onDelete: 'SET NULL',
});
Estimate.belongsTo(Customer, {
  foreignKey: { name: 'customerId', allowNull: true },
  onDelete: 'SET NULL',
});
Estimate.belongsTo(Jobsite, {
  foreignKey: { name: 'jobsiteId', allowNull: true },
  onDelete: 'SET NULL',
});
Estimate.hasMany(EstimateItem, {
  foreignKey: { name: 'estimateId', allowNull: false },
  onDelete: 'CASCADE',
  hooks: true,
});
EstimateItem.belongsTo(Estimate, {
  foreignKey: { name: 'estimateId', allowNull: false },
  onDelete: 'CASCADE',
});

Job.belongsTo(Estimate, {
  foreignKey: { name: 'estimateId', allowNull: true },
  onDelete: 'SET NULL',
});
Job.belongsTo(Customer, {
  foreignKey: { name: 'customerId', allowNull: true },
  onDelete: 'SET NULL',
});
Job.belongsTo(Jobsite, {
  foreignKey: { name: 'jobsiteId', allowNull: true },
  onDelete: 'SET NULL',
});
Job.belongsTo(User, {
  as: 'assignedTech',
  foreignKey: { name: 'assignedTo', allowNull: true },
  onDelete: 'SET NULL',
});
User.hasMany(Job, {
  foreignKey: { name: 'assignedTo', allowNull: true },
  as: 'assignedJobs',
});
Job.hasMany(Task, {
  foreignKey: { name: 'jobId', allowNull: false },
  onDelete: 'CASCADE',
  hooks: true,
});
Task.belongsTo(Job, {
  foreignKey: { name: 'jobId', allowNull: false },
  onDelete: 'CASCADE',
});
Task.belongsTo(User, {
  as: 'assignee',
  foreignKey: { name: 'assignedTo', allowNull: true },
  onDelete: 'SET NULL',
});

Invoice.belongsTo(Job, {
  foreignKey: { name: 'jobId', allowNull: true },
  onDelete: 'CASCADE',
});
Job.hasMany(Invoice, {
  foreignKey: { name: 'jobId', allowNull: true },
  onDelete: 'CASCADE',
  hooks: true,
});
Invoice.hasMany(Payment, {
  foreignKey: { name: 'invoiceId', allowNull: false },
  onDelete: 'CASCADE',
  hooks: true,
});
Payment.belongsTo(Invoice, {
  foreignKey: { name: 'invoiceId', allowNull: false },
  onDelete: 'CASCADE',
});

Attachment.belongsTo(User, {
  as: 'uploader',
  foreignKey: { name: 'uploadedBy', allowNull: true },
  onDelete: 'SET NULL',
});

Job.hasMany(ChangeOrder, {
  foreignKey: { name: 'jobId', allowNull: false },
  onDelete: 'CASCADE',
  hooks: true,
});
ChangeOrder.belongsTo(Job, {
  foreignKey: { name: 'jobId', allowNull: false },
  onDelete: 'CASCADE',
});

Job.hasMany(CalendarEvent, {
  foreignKey: { name: 'jobId', allowNull: false },
  onDelete: 'CASCADE',
  hooks: true,
});
CalendarEvent.belongsTo(Job, {
  foreignKey: { name: 'jobId', allowNull: false },
  onDelete: 'CASCADE',
});
CalendarEvent.belongsTo(User, {
  as: 'assignee',
  foreignKey: { name: 'assigneeId', allowNull: true },
  onDelete: 'SET NULL',
});

Job.hasMany(Reminder, {
  foreignKey: { name: 'jobId', allowNull: true },
  onDelete: 'CASCADE',
  hooks: true,
});
Reminder.belongsTo(Job, {
  foreignKey: { name: 'jobId', allowNull: true },
  onDelete: 'CASCADE',
});
Reminder.belongsTo(User, {
  foreignKey: { name: 'userId', allowNull: true },
  onDelete: 'SET NULL',
});
User.hasMany(Reminder, {
  foreignKey: { name: 'userId', allowNull: true },
});

export { sequelize };
