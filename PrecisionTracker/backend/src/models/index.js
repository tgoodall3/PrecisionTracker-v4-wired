import { Sequelize, DataTypes } from 'sequelize';

const dialect = process.env.DB_DIALECT || 'sqlite';
let sequelize;
if (dialect === 'sqlite') {
  sequelize = new Sequelize({ dialect, storage: process.env.DB_STORAGE || './data/dev.sqlite', logging: false });
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

// Associations
Customer.hasMany(Jobsite, { foreignKey: 'customerId' });
Jobsite.belongsTo(Customer, { foreignKey: 'customerId' });

Customer.hasMany(Lead, { foreignKey: 'customerId' });
Lead.belongsTo(Customer, { foreignKey: 'customerId' });
Lead.belongsTo(Jobsite, { foreignKey: 'jobsiteId' });

Estimate.belongsTo(Lead, { foreignKey: 'leadId' });
Estimate.belongsTo(Customer, { foreignKey: 'customerId' });
Estimate.belongsTo(Jobsite, { foreignKey: 'jobsiteId' });
Estimate.hasMany(EstimateItem, { foreignKey: 'estimateId' });
EstimateItem.belongsTo(Estimate, { foreignKey: 'estimateId' });

Job.belongsTo(Estimate, { foreignKey: 'estimateId' });
Job.belongsTo(Customer, { foreignKey: 'customerId' });
Job.belongsTo(Jobsite, { foreignKey: 'jobsiteId' });
Job.belongsTo(User, { as: 'assignedTech', foreignKey: 'assignedTo' });
User.hasMany(Job, { foreignKey: 'assignedTo', as: 'assignedJobs' });
Job.hasMany(Task, { foreignKey: 'jobId' });
Task.belongsTo(Job, { foreignKey: 'jobId' });
Task.belongsTo(User, { as: 'assignee', foreignKey: 'assignedTo' });

Invoice.belongsTo(Job, { foreignKey: 'jobId' });
Invoice.hasMany(Payment, { foreignKey: 'invoiceId' });
Payment.belongsTo(Invoice, { foreignKey: 'invoiceId' });

Attachment.belongsTo(User, { as: 'uploader', foreignKey: 'uploadedBy' });

export { sequelize };
Job.hasMany(ChangeOrder, { foreignKey: 'jobId' });
ChangeOrder.belongsTo(Job, { foreignKey: 'jobId' });

Job.hasMany(CalendarEvent, { foreignKey: 'jobId' });
CalendarEvent.belongsTo(Job, { foreignKey: 'jobId' });
CalendarEvent.belongsTo(User, { as: 'assignee', foreignKey: 'assigneeId' });
