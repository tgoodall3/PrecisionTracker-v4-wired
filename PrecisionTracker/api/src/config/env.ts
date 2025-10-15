import fs from 'node:fs';
import path from 'node:path';
import { config as loadEnv } from 'dotenv';
import { z } from 'zod';

const ENV_FILE_LOOKUP: Record<string, string> = {
  production: '.env',
  development: '.env',
  test: '.env.test'
};

const nodeEnv = process.env.NODE_ENV ?? 'development';
const candidateEnvFile = ENV_FILE_LOOKUP[nodeEnv] ?? '.env';
const envPath = path.resolve(process.cwd(), candidateEnvFile);

if (fs.existsSync(envPath)) {
  loadEnv({ path: envPath });
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.string().optional(),
  APP_URL: z.string().url().default('http://localhost:4000'),
  FRONTEND_URL: z.string().url().optional(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  DATABASE_URL: z.string().optional(),
  SQLITE_STORAGE: z.string().optional(),
  SYNC_PAGE_SIZE: z.string().optional(),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  JWT_ISSUER: z.string().optional(),
  JWT_AUDIENCE: z.string().optional(),
  JWT_EXPIRES_IN: z.string().default('7d'),

  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  LOCAL_STORAGE_DIR: z.string().optional(),

  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_REGION: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  S3_ENDPOINT: z.string().optional(),
  S3_FORCE_PATH_STYLE: z.string().optional(),
  S3_PRESIGNED_EXPIRATION: z.string().optional(),
  S3_PUBLIC_BASE_URL: z.string().optional(),

  EMAIL_PROVIDER: z.enum(['smtp', 'resend']).default('smtp'),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.string().optional(),
  SMTP_SECURE: z.string().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),

  SUPPORT_EMAIL: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
  PRESIGNED_UPLOAD_TTL_SECONDS: z.string().optional(),

  ENABLE_REMINDERS: z.string().optional(),
  REMINDER_CRON: z.string().optional(),

  SERVICE_EMAIL: z.string().optional(),

  SENTRY_DSN: z.string().optional()
});

type RawEnv = z.infer<typeof envSchema>;

const parseBoolean = (value: string | undefined, fallback = false): boolean => {
  if (value === undefined) {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  return ['true', '1', 'yes', 'y', 'on'].includes(normalized);
};

const parseNumber = (value: string | undefined, fallback: number): number => {
  if (value === undefined || value === '') {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);

  return Number.isNaN(parsed) ? fallback : parsed;
};

const rawResult = envSchema.safeParse({
  ...process.env,
  NODE_ENV: nodeEnv
});

if (!rawResult.success) {
  const errors = rawResult.error.flatten().fieldErrors;
  const message = Object.entries(errors)
    .map(([key, issues]) => `${key}: ${issues?.join(', ')}`)
    .join('; ');

  throw new Error(`Invalid environment variables: ${message}`);
}

const rawEnv: RawEnv = rawResult.data;

if (rawEnv.NODE_ENV === 'production' && !rawEnv.DATABASE_URL) {
  throw new Error('DATABASE_URL is required when NODE_ENV is production');
}

const sqliteStorage = rawEnv.DATABASE_URL
  ? rawEnv.SQLITE_STORAGE
  : rawEnv.SQLITE_STORAGE ?? path.resolve(process.cwd(), 'data/dev.sqlite');

if (!rawEnv.DATABASE_URL && !sqliteStorage) {
  throw new Error('Provide either DATABASE_URL or SQLITE_STORAGE for non-production environments');
}

const storageDriver = rawEnv.STORAGE_DRIVER;
const emailFrom = rawEnv.EMAIL_FROM ?? rawEnv.SMTP_FROM;

if (storageDriver === 's3') {
  const requiredS3Entries: Array<[keyof RawEnv, string]> = [
    ['S3_ACCESS_KEY_ID', 'S3_ACCESS_KEY_ID'],
    ['S3_SECRET_ACCESS_KEY', 'S3_SECRET_ACCESS_KEY'],
    ['S3_REGION', 'S3_REGION'],
    ['S3_BUCKET', 'S3_BUCKET']
  ];

  const missing = requiredS3Entries
    .filter(([key]) => !rawEnv[key])
    .map(([, label]) => label);

  if (missing.length > 0) {
    throw new Error(`Missing S3 configuration values: ${missing.join(', ')}`);
  }
}

if (rawEnv.EMAIL_PROVIDER === 'smtp') {
  const requiredSmtpEntries: Array<[keyof RawEnv, string]> = [
    ['SMTP_HOST', 'SMTP_HOST'],
    ['SMTP_PORT', 'SMTP_PORT'],
    ['SMTP_USER', 'SMTP_USER'],
    ['SMTP_PASS', 'SMTP_PASS']
  ];

  const missing = requiredSmtpEntries
    .filter(([key]) => !rawEnv[key])
    .map(([, label]) => label);

  if (!emailFrom) {
    missing.push('EMAIL_FROM');
  }

  if (missing.length > 0) {
    throw new Error(`Missing SMTP configuration values: ${missing.join(', ')}`);
  }
} else if (rawEnv.EMAIL_PROVIDER === 'resend') {
  const missing: string[] = [];

  if (!rawEnv.RESEND_API_KEY) {
    missing.push('RESEND_API_KEY');
  }
  if (!emailFrom) {
    missing.push('EMAIL_FROM');
  }

  if (missing.length > 0) {
    throw new Error(`Missing email configuration values: ${missing.join(', ')}`);
  }
}

const resolvedSqlitePath = sqliteStorage
  ? path.isAbsolute(sqliteStorage)
    ? sqliteStorage
    : path.resolve(process.cwd(), sqliteStorage)
  : undefined;

const appConfig = {
  nodeEnv: rawEnv.NODE_ENV,
  isProduction: rawEnv.NODE_ENV === 'production',
  isDevelopment: rawEnv.NODE_ENV === 'development',
  port: parseNumber(rawEnv.PORT, 4000),
  appUrl: rawEnv.APP_URL,
  frontendUrl: rawEnv.FRONTEND_URL,
  logLevel: rawEnv.LOG_LEVEL,
  database: {
    url: rawEnv.DATABASE_URL,
    sqlite: resolvedSqlitePath,
    dialect: rawEnv.DATABASE_URL ? 'postgres' : 'sqlite'
  },
  auth: {
    jwtSecret: rawEnv.JWT_SECRET,
    jwtRefreshSecret: rawEnv.JWT_REFRESH_SECRET,
    issuer: rawEnv.JWT_ISSUER ?? 'precisiontracker',
    audience: rawEnv.JWT_AUDIENCE ?? 'precisiontracker-clients',
    expiresIn: rawEnv.JWT_EXPIRES_IN
  },
  storage: {
    driver: storageDriver,
    local: {
      directory: rawEnv.LOCAL_STORAGE_DIR ?? path.resolve(process.cwd(), 'storage')
    },
    s3: storageDriver === 's3'
      ? {
          accessKeyId: rawEnv.S3_ACCESS_KEY_ID ?? '',
          secretAccessKey: rawEnv.S3_SECRET_ACCESS_KEY ?? '',
          region: rawEnv.S3_REGION ?? '',
          bucket: rawEnv.S3_BUCKET ?? '',
          endpoint: rawEnv.S3_ENDPOINT,
          forcePathStyle: parseBoolean(rawEnv.S3_FORCE_PATH_STYLE, false),
          presignedExpirationSeconds: parseNumber(rawEnv.S3_PRESIGNED_EXPIRATION, 15 * 60),
          publicBaseUrl: rawEnv.S3_PUBLIC_BASE_URL
        }
      : undefined
  },
  email: {
    provider: rawEnv.EMAIL_PROVIDER,
    smtp: rawEnv.EMAIL_PROVIDER === 'smtp'
      ? {
          host: rawEnv.SMTP_HOST ?? '',
          port: parseNumber(rawEnv.SMTP_PORT, 587),
          secure: parseBoolean(rawEnv.SMTP_SECURE, false),
          user: rawEnv.SMTP_USER,
          pass: rawEnv.SMTP_PASS,
          from: emailFrom ?? 'PrecisionTracker <no-reply@precisiontracker.local>'
        }
      : undefined,
    resend: rawEnv.EMAIL_PROVIDER === 'resend'
      ? {
          apiKey: rawEnv.RESEND_API_KEY ?? ''
        }
      : undefined,
    supportEmail: rawEnv.SUPPORT_EMAIL ?? 'support@precisiontracker.local',
    from: emailFrom ?? 'PrecisionTracker <no-reply@precisiontracker.local>'
  },
  sync: {
    pageSize: parseNumber(rawEnv.SYNC_PAGE_SIZE, 200),
    presignedUploadTtlSeconds: parseNumber(rawEnv.PRESIGNED_UPLOAD_TTL_SECONDS, 15 * 60)
  },
  reminders: {
    enabled: parseBoolean(rawEnv.ENABLE_REMINDERS, false),
    cronExpression: rawEnv.REMINDER_CRON ?? '*/5 * * * *',
    serviceEmail: rawEnv.SERVICE_EMAIL ?? rawEnv.SUPPORT_EMAIL ?? 'support@precisiontracker.local'
  },
  sentry: {
    dsn: rawEnv.SENTRY_DSN
  }
} as const;

export type AppConfig = typeof appConfig;

export const config: AppConfig = appConfig;

export default config;

export const envSummary = {
  alwaysRequired: [
    'JWT_SECRET (>=32 chars)',
    'JWT_REFRESH_SECRET (>=32 chars)'
  ],
  requiredInProduction: [
    'DATABASE_URL'
  ],
  requiredForDevelopmentWithoutDatabaseUrl: [
    'SQLITE_STORAGE (path to sqlite file; defaults to ./data/dev.sqlite)'
  ],
  requiredWhenStorageDriverIsS3: [
    'S3_ACCESS_KEY_ID',
    'S3_SECRET_ACCESS_KEY',
    'S3_REGION',
    'S3_BUCKET'
  ],
  requiredForSmtpEmail: [
    'SMTP_HOST',
    'SMTP_PORT',
    'SMTP_USER',
    'SMTP_PASS',
    'EMAIL_FROM (or legacy SMTP_FROM)'
  ],
  requiredForResendEmail: [
    'RESEND_API_KEY',
    'EMAIL_FROM'
  ],
  optional: [
    'PORT',
    'APP_URL',
    'FRONTEND_URL',
    'LOG_LEVEL',
    'SQLITE_STORAGE (when DATABASE_URL is provided)',
    'LOCAL_STORAGE_DIR',
    'S3_ENDPOINT',
    'S3_FORCE_PATH_STYLE',
    'S3_PRESIGNED_EXPIRATION',
    'S3_PUBLIC_BASE_URL',
    'SUPPORT_EMAIL',
    'SERVICE_EMAIL',
    'SMTP_FROM (legacy fallback for EMAIL_FROM)',
    'PRESIGNED_UPLOAD_TTL_SECONDS',
    'SYNC_PAGE_SIZE',
    'ENABLE_REMINDERS',
    'REMINDER_CRON',
    'SENTRY_DSN'
  ]
} as const;
