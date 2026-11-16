import { PgBoss, type Job, type QueueOptions, type SendOptions } from 'pg-boss';
import { env } from '../../config/env.js';
import { logger } from '../logger.js';

/**
 * Typed job registry. Postgres-backed (pg-boss), so scheduling needs no extra
 * infrastructure: the same Cloud SQL instance stores jobs, and delayed jobs
 * (`startAfter`) are how scheduled posts and campaigns fire on time.
 */
export interface JobPayloads {
  'post.publish': { postId: string };
  'post.metrics.sync': Record<string, never>;
  'account.metrics.sync': Record<string, never>;
  'social.tokens.refresh': Record<string, never>;
  'campaign.send': { campaignId: string };
  'campaign.batch': { campaignId: string; sendIds: string[] };
  'contacts.import': {
    importId: string;
    storageKey: string;
    mapping: Record<string, string>;
    listId?: string;
    tags: string[];
  };
  'ai.poll': { generationId: string };
  'credits.maintenance': Record<string, never>;
  'autopilot.fill': Record<string, never>;
}
export type JobName = keyof JobPayloads;

/** Per-queue retry policy. Publishing retries with backoff; batches are idempotent. */
export const QUEUE_POLICIES: Record<JobName, QueueOptions> = {
  'post.publish': { retryLimit: 3, retryDelay: 60, retryBackoff: true, expireInSeconds: 15 * 60 },
  'post.metrics.sync': { retryLimit: 1, expireInSeconds: 30 * 60 },
  'account.metrics.sync': { retryLimit: 1, expireInSeconds: 30 * 60 },
  'social.tokens.refresh': { retryLimit: 2, expireInSeconds: 15 * 60 },
  'campaign.send': { retryLimit: 2, retryDelay: 30, expireInSeconds: 15 * 60 },
  'campaign.batch': { retryLimit: 5, retryDelay: 30, retryBackoff: true, expireInSeconds: 15 * 60 },
  'contacts.import': { retryLimit: 1, expireInSeconds: 60 * 60 },
  'ai.poll': { retryLimit: 60, retryDelay: 10, expireInSeconds: 5 * 60 },
  'credits.maintenance': { retryLimit: 1 },
  'autopilot.fill': { retryLimit: 1 },
};

/** Recurring jobs (cron, UTC). */
export const CRON_SCHEDULES: Partial<Record<JobName, string>> = {
  'post.metrics.sync': '0 */3 * * *',
  'account.metrics.sync': '15 2 * * *',
  'social.tokens.refresh': '30 * * * *',
  'credits.maintenance': '*/10 * * * *',
  'autopilot.fill': '0 * * * *',
};

let boss: PgBoss | null = null;
let starting: Promise<PgBoss> | null = null;

export const getQueue = async (): Promise<PgBoss> => {
  if (boss) return boss;
  starting ??= (async () => {
    const instance = new PgBoss({ connectionString: env.DATABASE_URL, schema: 'pgboss' });
    instance.on('error', (err) => logger.error({ err }, 'pg-boss error'));
    await instance.start();
    for (const [name, policy] of Object.entries(QUEUE_POLICIES)) {
      await instance.createQueue(name, policy);
    }
    boss = instance;
    return instance;
  })();
  return starting;
};

export const enqueue = async <N extends JobName>(
  name: N,
  data: JobPayloads[N],
  options: SendOptions = {},
): Promise<string | null> => (await getQueue()).send(name, data, options);

export const cancelJob = async (name: JobName, id: string | null | undefined) => {
  if (!id) return;
  try {
    await (await getQueue()).cancel(name, id);
  } catch (err) {
    logger.warn({ err, name, id }, 'Could not cancel job (it may have already run)');
  }
};

export type JobHandler<N extends JobName> = (
  data: JobPayloads[N],
  job: Job<JobPayloads[N]>,
) => Promise<void>;
export type JobHandlers = { [N in JobName]: JobHandler<N> };

export const registerWorkers = async (handlers: JobHandlers, concurrency = 4) => {
  const q = await getQueue();
  for (const name of Object.keys(handlers) as JobName[]) {
    const handler = handlers[name] as JobHandler<JobName>;
    await q.work<JobPayloads[JobName]>(name, { localConcurrency: concurrency }, async (jobs) => {
      for (const job of jobs) {
        const started = Date.now();
        try {
          await handler(job.data, job);
          logger.info({ job: name, id: job.id, ms: Date.now() - started }, 'job completed');
        } catch (err) {
          logger.error({ err, job: name, id: job.id }, 'job failed');
          throw err;
        }
      }
    });
  }
  for (const [name, cron] of Object.entries(CRON_SCHEDULES)) {
    await q.schedule(name, cron, {}, { tz: 'UTC' });
  }
};

export const stopQueue = async () => {
  if (boss) await boss.stop({ graceful: true });
  boss = null;
  starting = null;
};
