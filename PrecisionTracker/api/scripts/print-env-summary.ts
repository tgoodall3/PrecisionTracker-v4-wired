const ensureBaselineEnv = () => {
  process.env.NODE_ENV ??= 'development';
  process.env.APP_URL ??= 'http://localhost:4000';
  process.env.JWT_SECRET ??= 'development-placeholder-secret-for-env-summary-0001';
  process.env.JWT_REFRESH_SECRET ??= 'development-placeholder-refresh-secret-0001';
  process.env.SQLITE_STORAGE ??= './data/dev.sqlite';
  process.env.EMAIL_PROVIDER ??= 'smtp';
  process.env.SMTP_HOST ??= 'smtp.example.com';
  process.env.SMTP_PORT ??= '587';
  process.env.SMTP_SECURE ??= 'false';
  process.env.SMTP_USER ??= 'placeholder-user';
  process.env.SMTP_PASS ??= 'placeholder-pass';
  process.env.EMAIL_FROM ??= 'PrecisionTracker <no-reply@example.com>';
};

const printSection = (title: string, entries: readonly string[]) => {
  if (entries.length === 0) {
    return;
  }

  console.log(`\n${title}:`);
  for (const entry of entries) {
    console.log(`  • ${entry}`);
  }
};

const main = async () => {
  ensureBaselineEnv();
  const { envSummary } = await import('../src/config/env');

  const headline = 'PrecisionTracker API environment variables';
  console.log(headline);
  console.log('-'.repeat(headline.length));

  printSection('Always required', envSummary.alwaysRequired);
  printSection('Required in production', envSummary.requiredInProduction);
  printSection(
    'Required in development/test when DATABASE_URL is omitted',
    envSummary.requiredForDevelopmentWithoutDatabaseUrl
  );
  printSection('Required when STORAGE_DRIVER=s3', envSummary.requiredWhenStorageDriverIsS3);
  printSection('Required when EMAIL_PROVIDER=smtp', envSummary.requiredForSmtpEmail);
  printSection('Required when EMAIL_PROVIDER=resend', envSummary.requiredForResendEmail);
  printSection('Optional', envSummary.optional);

  console.log('\nTip: copy api/.env.example, adjust the required variables above, then run npm run typecheck.');
};

main().catch((error) => {
  console.error('Failed to print environment summary.');
  console.error(error);
  process.exit(1);
});
