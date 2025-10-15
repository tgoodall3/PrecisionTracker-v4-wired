import { Sequelize } from 'sequelize';
import config from '../config/env';
import logger from '../logger';

const shouldLogSql = config.logLevel === 'debug' || config.logLevel === 'trace';

const commonOptions = {
  logging: shouldLogSql ? (sql: string) => logger.debug({ sql }, 'sequelize.query') : false,
  define: {
    underscored: false,
    freezeTableName: false,
    timestamps: true
  }
} as const;

const sequelize =
  config.database.dialect === 'postgres' && config.database.url
    ? new Sequelize(config.database.url, {
        ...commonOptions,
        dialect: 'postgres',
        dialectOptions: {
          ssl: config.isProduction
            ? {
                require: true,
                rejectUnauthorized: false
              }
            : undefined
        }
      })
    : new Sequelize({
        ...commonOptions,
        dialect: 'sqlite',
        storage: config.database.sqlite ?? ':memory:',
        pool: {
          max: 1,
          min: 0,
          acquire: 60_000,
          idle: 10_000
        },
        dialectOptions: {
          busyTimeout: 60_000
        }
      });

export default sequelize;
