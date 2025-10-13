import { Op } from 'sequelize';
import { Reminder, Job, Customer, Jobsite, User } from '../models/index.js';
import { sendEmail, sendSms, sendPushNotification } from '../utils/notifier.js';

const windowMs = +(process.env.REMINDER_INTERVAL_MS || 60000);
let timer = null;
let running = false;

function renderTemplate(reminder, job, customer, jobsite) {
  const companyName = process.env.BUSINESS_NAME || 'Precision Tracker';
  const jobName = job?.name || `Job #${job?.id || ''}`;
  switch ((reminder.template || '').toUpperCase()) {
    case 'INVOICE_FOLLOW_UP': {
      return {
        subject: `${companyName} – Invoice reminder`,
        html: `<p>Hello ${customer?.name || 'there'},</p><p>This is a friendly reminder that payment for ${jobName} is still outstanding.</p><p>Please reach out if you have any questions.</p><p>Thanks,<br/>${companyName}</p>`,
        sms: `Reminder: Invoice for ${jobName} is still open. Reply here if you need help.`,
        push: `Invoice reminder for ${jobName}`,
      };
    }
    case 'SCHEDULE_CONFIRMATION': {
      return {
        subject: `${companyName} – Appointment confirmation`,
        html: `<p>Hi ${customer?.name || 'there'},</p><p>We’re confirming your upcoming appointment for ${jobName} at ${jobsite?.addressLine1 || 'the scheduled location'}.</p><p>See you soon!</p>`,
        sms: `Reminder: upcoming appointment for ${jobName}. Reply to reschedule.`,
        push: `Upcoming appointment for ${jobName}`,
      };
    }
    case 'FOLLOW_UP':
    default: {
      return {
        subject: `${companyName} – Follow up`,
        html: `<p>Hello ${customer?.name || 'there'},</p><p>We’re checking in about ${jobName}. Let us know if you need anything else.</p><p>Best,<br/>${companyName}</p>`,
        sms: `Checking in on ${jobName}. Need anything from us?`,
        push: `Follow up for ${jobName}`,
      };
    }
  }
}

async function deliverReminder(reminder) {
  const job = reminder.jobId ? await Job.findByPk(reminder.jobId, { include: [Customer, Jobsite] }) : null;
  const customer = job?.Customer;
  const jobsite = job?.Jobsite;
  const template = renderTemplate(reminder, job, customer, jobsite);
  const payload = reminder.payload || {};

  if (reminder.channel === 'EMAIL') {
    const to = payload.email || customer?.email;
    if (!to) throw new Error('No email available for reminder');
    await sendEmail(to, template.subject, template.html);
  } else if (reminder.channel === 'SMS') {
    const to = payload.phone || customer?.phone;
    if (!to) throw new Error('No phone available for reminder');
    await sendSms(to, template.sms);
  } else if (reminder.channel === 'PUSH') {
    const user = reminder.userId ? await User.findByPk(reminder.userId) : null;
    const token = payload.pushToken || user?.pushToken;
    if (!token) throw new Error('No push token available for reminder');
    await sendPushNotification(token, template.subject, template.push, { jobId: reminder.jobId });
  } else {
    throw new Error(`Unsupported channel ${reminder.channel}`);
  }
}

export async function dispatchReminder(reminder) {
  try {
    await deliverReminder(reminder);
    await reminder.update({ status: 'SENT', lastError: null, updatedAt: new Date() });
  } catch (error) {
    await reminder.update({ status: 'FAILED', lastError: error.message, updatedAt: new Date() });
    throw error;
  }
}

async function processDueReminders() {
  if (running) return;
  running = true;
  try {
    const due = await Reminder.findAll({
      where: {
        status: 'PENDING',
        scheduledFor: { [Op.lte]: new Date() },
      },
      limit: 25,
    });
    for (const reminder of due) {
      try {
        await dispatchReminder(reminder);
      } catch (err) {
        console.error('Reminder dispatch failed', err?.message || err);
      }
    }
  } catch (err) {
    console.error('Reminder worker error', err?.message || err);
  } finally {
    running = false;
  }
}

export function startReminderWorker() {
  if (timer) return;
  timer = setInterval(processDueReminders, windowMs);
  processDueReminders().catch(() => {});
}
