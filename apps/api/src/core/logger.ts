import { pino } from 'pino';
import { env, isProd } from '../config/env.js';

/** Structured JSON logs in production (Cloud Logging picks up `severity`). */
export const logger = pino({
  level: env.LOG_LEVEL,
  base: { service: process.env.SERVICE_NAME ?? 'automarket-api' },
  messageKey: 'message',
  formatters: { level: (label) => ({ severity: label.toUpperCase() }) },
  redact: ['req.headers.authorization', 'req.headers.cookie', '*.password', '*.accessToken'],
  ...(isProd
    ? {}
    : { transport: { target: 'pino-pretty', options: { colorize: true, messageKey: 'message' } } }),
});
