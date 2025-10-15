import pino from 'pino';
import config from './config/env';

const logger = pino({
  level: config.logLevel,
  base: {
    env: config.nodeEnv
  },
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie', 'password', '*.password'],
    censor: '[REDACTED]'
  }
});

export default logger;
