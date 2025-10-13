# PrecisionTracker Backend (Express + Sequelize)

Features:
- Users auth & roles (Admin/Estimator/Supervisor/Tech)
- Leads, Estimates (+items), Jobs, Tasks, Invoices, Payments
- Change Orders & Calendar Events
- AI helper endpoints (mock stubs)
- Uploads + Public client portal (estimate page with approve + pay link)
- PDF generation (estimates) and signature PNG support
- Integrations scaffold: Stripe payments, Twilio SMS

## Quick start
```bash
cd backend
cp .env.example .env
npm i
npm run db:sync
npm run dev
```

Optional env:
```
STRIPE_SECRET=sk_test_...
TWILIO_SID=ACxxxx
TWILIO_TOKEN=yyyy
TWILIO_FROM=+15555555555
```

Endpoints highlights:
- GET /portal/estimate/:id          (client-facing)
- GET /pdf/estimate/:id             (PDF)
- POST /integrations/stripe/checkout-link
- POST /integrations/twilio/sms
- GET/POST/PATCH /change-orders/*
- GET/POST/PATCH /calendar/*
- GET/POST/PATCH/DELETE /users/*

### AI (OpenAI)
Set `OPENAI_API_KEY` in `.env` to enable real suggestions & summaries.
