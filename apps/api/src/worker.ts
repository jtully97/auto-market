import http from 'node:http';
import { env } from './config/env.js';
import { prisma } from './core/db/prisma.js';
import { logger } from './core/logger.js';
import { registerWorkers, stopQueue } from './core/queue/queue.js';
import { jobHandlers } from './jobs/handlers.js';

/**
 * Background worker: publishing, metric sync, email sends, imports, AI polling,
 * credit maintenance and autopilot. Runs as its own Cloud Run service
 * (min-instances=1, CPU always allocated) so scheduled jobs fire on time.
 */
const main = async () => {
  await registerWorkers(jobHandlers, Number(process.env.WORKER_CONCURRENCY ?? 4));
  logger.info('worker started');

  // Cloud Run requires the container to listen on $PORT.
  http.createServer((_req, res) => res.end('ok')).listen(env.PORT);

  const shutdown = async () => {
    await stopQueue();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown());
  process.on('SIGINT', () => void shutdown());
};

main().catch((err) => {
  logger.fatal({ err }, 'worker failed to start');
  process.exit(1);
});
