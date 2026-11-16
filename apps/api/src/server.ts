import { createApp } from './app.js';
import { env } from './config/env.js';
import { prisma } from './core/db/prisma.js';
import { logger } from './core/logger.js';
import { getQueue, stopQueue } from './core/queue/queue.js';

const main = async () => {
  await getQueue(); // the API enqueues jobs; workers run in the separate worker service
  const server = createApp().listen(env.PORT, () => logger.info(`API listening on :${env.PORT}`));

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
