import { createApp } from './app.js';
import { env } from './config/env.js';
import { prisma } from './core/db/prisma.js';
import { logger } from './core/logger.js';
import { getQueue, stopQueue } from './core/queue/queue.js';

const main = async () => {
  const server = createApp().listen(env.PORT, () => logger.info(`API listening on :${env.PORT}`));
  // The API only enqueues jobs (workers run separately). Connect in the background so the
  // server stays up — and /readyz reports the problem — if the database is briefly unavailable.
  void getQueue();

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'shutting down');
    server.close();
    await stopQueue();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
};

main().catch((err) => {
  logger.fatal({ err }, 'API failed to start');
  process.exit(1);
});
