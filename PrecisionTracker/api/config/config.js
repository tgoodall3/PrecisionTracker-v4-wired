/* eslint-disable @typescript-eslint/no-var-requires */
const path = require('node:path');
const fs = require('node:fs');
const { config: loadEnv } = require('dotenv');

const envFile = ['.env.local', '.env'].find((candidate) => {
  const resolved = path.resolve(process.cwd(), candidate);
  return fs.existsSync(resolved);
});

if (envFile) {
  loadEnv({ path: envFile });
} else {
  loadEnv();
}

const toBoolean = (value, fallback = false) => {
  if (value == null) {
    return fallback;
  }
  return ['true', '1', 'yes', 'y', 'on'].includes(String(value).toLowerCase());
};

const toNumber = (value, fallback) => {
  if (value == null || value === '') {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};

const SQLITE_DEFAULT = path.resolve(process.cwd(), 'data', 'dev.sqlite');

const commonOptions = {
  define: {
    underscored: false,
    freezeTableName: false
  },
  logging:
    process.env.SEQUELIZE_LOGGING === 'json'
      ? (...args) => console.log(JSON.stringify(args))
      : process.env.SEQUELIZE_LOGGING === 'true'
}

const sqliteStorage =
  process.env.SQLITE_STORAGE && path.isAbsolute(process.env.SQLITE_STORAGE)
    ? process.env.SQLITE_STORAGE
    : process.env.SQLITE_STORAGE
    ? path.resolve(process.cwd(), process.env.SQLITE_STORAGE)
    : SQLITE_DEFAULT;

const sqliteConfig = {
  ...commonOptions,
  dialect: 'sqlite',
  storage: sqliteStorage,
  dialectOptions: {
    busyTimeout: toNumber(process.env.SQLITE_BUSY_TIMEOUT, 60000)
  }
};

const pgConfig = {
  ...commonOptions,
  dialect: 'postgres',
  url: process.env.DATABASE_URL,
  use_env_variable: 'DATABASE_URL',
  dialectOptions: {
    ssl: toBoolean(process.env.PG_SSL, process.env.NODE_ENV === 'production')
      ? {
          require: true,
          rejectUnauthorized: toBoolean(process.env.PG_SSL_REJECT_UNAUTHORIZED, false)
        }
      : false
  }
};

module.exports = {
  development: process.env.DATABASE_URL ? pgConfig : sqliteConfig,
  test: process.env.TEST_DATABASE_URL
    ? {
        ...pgConfig,
        url: process.env.TEST_DATABASE_URL,
        use_env_variable: 'TEST_DATABASE_URL'
      }
    : {
        ...sqliteConfig,
        storage: sqliteStorage.replace(/\.sqlite$/, '.test.sqlite')
      },
  production: pgConfig
};
