import nodemailer from 'nodemailer';
import twilio from 'twilio';

const smtpEnabled = !!process.env.SMTP_HOST;
const smsEnabled = !!(process.env.TWILIO_SID && process.env.TWILIO_TOKEN && process.env.TWILIO_FROM);

let transporter = null;
if (smtpEnabled) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: +(process.env.SMTP_PORT || 587),
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined
  });
}

export async function sendEmail(to, subject, html){
  if(!smtpEnabled) return { sent: false, mock: true };
  const from = process.env.SMTP_FROM || 'no-reply@precisiontracker.local';
  const info = await transporter.sendMail({ from, to, subject, html });
  return { sent: true, id: info.messageId };
}

export async function sendSms(to, body){
  if(!smsEnabled) return { sent: false, mock: true };
  const client = twilio(process.env.TWILIO_SID, process.env.TWILIO_TOKEN);
  const resp = await client.messages.create({ from: process.env.TWILIO_FROM, to, body });
  return { sent: true, sid: resp.sid };
}

export async function sendPushNotification(token, title, body, data = {}) {
  if (!token) return { sent: false, reason: 'missing token' };
  if (!token.startsWith('ExponentPushToken')) {
    return { sent: false, reason: 'invalid token' };
  }
  try {
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: token, title, body, data }),
    });
    const payload = await response.json();
    if (payload?.data?.status === 'ok') {
      return { sent: true, id: payload.data.id };
    }
    return { sent: false, reason: payload?.data?.message || 'Unknown push response' };
  } catch (error) {
    return { sent: false, reason: error.message || 'Push send failed' };
  }
}
