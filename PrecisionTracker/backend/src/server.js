import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { sequelize } from './models/index.js';
import authRouter from './routes/auth.js';
import customersRouter from './routes/customers.js';
import leadsRouter from './routes/leads.js';
import estimatesRouter from './routes/estimates.js';
import jobsRouter from './routes/jobs.js';
import tasksRouter from './routes/tasks.js';
import invoicesRouter from './routes/invoices.js';
import aiRouter from './routes/ai.js';
import pdfRouter from './routes/pdf.js';
import uploadRouter from './routes/upload.js';
import integRouter from './routes/integrations.js';
import usersRouter from './routes/users.js';
import calendarRouter from './routes/calendar.js';
import changeOrdersRouter from './routes/changeOrders.js';
import attachmentsRouter from './routes/attachments.js';
import paymentsRouter from './routes/payments.js';
import remindersRouter from './routes/reminders.js';
import analyticsRouter from './routes/analytics.js';
import { ensureSchema } from './utils/ensureSchema.js';
import { startReminderWorker } from './workers/reminderWorker.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '25mb' }));
import cookieParser from 'cookie-parser';
import bodyParser from 'body-parser';
import { create as createHbs } from 'express-handlebars';
import path from 'path';
import { fileURLToPath } from 'url';
import portalRouter from './routes/portal.js';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(cookieParser());
app.use(bodyParser.urlencoded({ extended: true }));

const hbs = createHbs({ defaultLayout: 'layout', extname: '.hbs', layoutsDir: path.join(__dirname, '../views') });
app.engine('.hbs', hbs.engine);
app.set('view engine', '.hbs');
app.set('views', path.join(__dirname, '../views'));

app.use('/static', express.static(new URL('../public', import.meta.url).pathname));

app.use('/uploads', express.static(new URL('../uploads', import.meta.url).pathname));

app.get('/', (_req, res) => res.json({ ok: true, service: 'contractor-backend' }));

app.use('/auth', authRouter);
app.use('/customers', customersRouter);
app.use('/leads', leadsRouter);
app.use('/estimates', estimatesRouter);
app.use('/jobs', jobsRouter);
app.use('/tasks', tasksRouter);
app.use('/invoices', invoicesRouter);
app.use('/ai', aiRouter);
app.use('/pdf', pdfRouter);
app.use('/upload', uploadRouter);
app.use('/integrations', integRouter);
app.use('/portal', portalRouter);
app.use('/users', usersRouter);
app.use('/calendar', calendarRouter);
app.use('/change-orders', changeOrdersRouter);
app.use('/attachments', attachmentsRouter);
app.use('/payments', paymentsRouter);
app.use('/reminders', remindersRouter);
app.use('/analytics', analyticsRouter);

// Global error handler
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Server error' });
});

const PORT = process.env.PORT || 4000;
async function start() {
  await sequelize.authenticate();
  console.log('DB connected');
  await ensureSchema();
  startReminderWorker();
  app.listen(PORT, () => console.log(`API on http://localhost:${PORT}`));
}
start();
