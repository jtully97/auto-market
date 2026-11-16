import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { env } from './config/env.js';
import { prisma } from './core/db/prisma.js';
import { errorHandler, notFoundHandler } from './core/http/middleware/error.js';
import { logger } from './core/logger.js';
import { localStorageDir } from './integrations/storage/storage.js';
import { trackingRoutes } from './modules/webhooks/webhook.routes.js';
import { apiModules } from './routes.js';

export const createApp = () => {
  const app = express();
  app.set('trust proxy', env.TRUST_PROXY_HOPS); // Cloud Run LB (+ web proxy)
  app.disable('x-powered-by');
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors({ origin: env.WEB_URL, credentials: true }));
  app.use(cookieParser());
  app.use(
    pinoHttp({
      logger,
      autoLogging: { ignore: (req) => req.url === '/healthz' },
      serializers: {
        req: (req: { method: string; url: string }) => ({
          method: req.method,
          url: req.url.split('?')[0],
        }),
        res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
      },
      customLogLevel: (_req, res, err) =>
        err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
    }),
  );

  app.get('/healthz', (_req, res) => res.json({ ok: true }));
  app.get('/readyz', async (_req, res) => {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ ok: true });
  });

  app.use(
    '/v1/auth',
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 50,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
    }),
  );
  app.use(
    '/v1/ai',
    rateLimit({ windowMs: 60 * 1000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false }),
  );

  for (const mod of apiModules) app.use(`/v1${mod.basePath}`, mod.router);
  app.use(trackingRoutes.basePath, trackingRoutes.router);
  if (localStorageDir) app.use('/media', express.static(localStorageDir, { maxAge: '1h' }));

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
};
