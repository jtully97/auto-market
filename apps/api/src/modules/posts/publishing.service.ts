import { prisma } from '../../core/db/prisma.js';
import { logger } from '../../core/logger.js';
import { getProvider } from '../../integrations/social/registry.js';
import { storage } from '../../integrations/storage/storage.js';
import { socialAccountService } from '../social-accounts/social-account.service.js';
import { postInclude } from './post.repository.js';

const MAX_ATTEMPTS = 3;

export class RetryablePublishError extends Error {}

/**
 * Publishes a post to every target. Idempotent: targets already PUBLISHED are
 * skipped, so job retries only re-attempt the channels that failed.
 */
export const publishingService = {
  async publish(postId: string) {
    const post = await prisma.post.findUnique({ where: { id: postId }, include: postInclude });
    if (!post) return;
    if (!['SCHEDULED', 'PUBLISHING', 'PARTIALLY_PUBLISHED', 'FAILED'].includes(post.status)) {
      logger.info({ postId, status: post.status }, 'skip publish: post not schedulable');
      return;
    }
    await prisma.post.update({ where: { id: postId }, data: { status: 'PUBLISHING' } });

    // Signed URLs valid for 6h — platforms fetch media asynchronously.
    const media = await Promise.all(
      post.media.map(async ({ media: m }) => ({
        kind: m.kind,
        mimeType: m.mimeType,
        url: await storage.readUrl(m.storageKey, 6 * 60 * 60),
      })),
    );

    for (const target of post.targets) {
      if (target.status === 'PUBLISHED' || target.status === 'SKIPPED') continue;
      if (target.attempts >= MAX_ATTEMPTS) continue;
      await prisma.postTarget.update({
        where: { id: target.id },
        data: { status: 'PUBLISHING', attempts: { increment: 1 } },
      });
      try {
        const account = target.socialAccount;
        const credentials = await socialAccountService.credentials(account);
        const result = await getProvider(account.platform).publish({
          account: credentials,
          caption: target.caption ?? post.caption,
          media,
          options: (target.options as Record<string, unknown>) ?? {},
        });
        await prisma.postTarget.update({
          where: { id: target.id },
          data: {
            status: 'PUBLISHED',
            externalPostId: result.externalPostId,
            externalUrl: result.url,
            publishedAt: new Date(),
            lastError: null,
          },
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        logger.warn({ err, postId, targetId: target.id }, 'publish target failed');
        await prisma.postTarget.update({
          where: { id: target.id },
          data: { status: 'FAILED', lastError: message.slice(0, 1000) },
        });
      }
    }

    const targets = await prisma.postTarget.findMany({ where: { postId } });
    const published = targets.filter((t) => t.status === 'PUBLISHED').length;
    const retryable = targets.filter(
      (t) => t.status === 'FAILED' && t.attempts < MAX_ATTEMPTS,
    ).length;
    const status =
      published === targets.length ? 'PUBLISHED' : published > 0 ? 'PARTIALLY_PUBLISHED' : 'FAILED';
    await prisma.post.update({
      where: { id: postId },
      data: {
        status,
        publishedAt: published ? new Date() : null,
        inQueue: false,
        failureReason: status === 'PUBLISHED' ? null : targets.find((t) => t.lastError)?.lastError,
      },
    });
    // Throwing hands the job back to pg-boss, which retries with exponential backoff.
    if (retryable) throw new RetryablePublishError(`${retryable} channel(s) failed; will retry`);
  },
};
