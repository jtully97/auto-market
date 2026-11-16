import {
  validateForPlatform,
  type ContentIssue,
  type UpsertPostInput,
  type listPostsQuerySchema,
} from '@automarket/shared';
import type { z } from 'zod';
import { prisma, type PostStatus } from '../../core/db/prisma.js';
import { BadRequestError, ValidationError } from '../../core/errors.js';
import { cancelJob, enqueue } from '../../core/queue/queue.js';
import { upcomingSlots } from '../../core/time.js';
import type { AuthUser, WorkspaceContext } from '../../core/http/types.js';
import { hasRole } from '../../core/http/middleware/auth.js';
import { presentMedia } from '../media/media.service.js';
import { presentAccount } from '../social-accounts/social-account.service.js';
import { usageService } from '../usage/usage.service.js';
import { postRepository, type PostWithRelations } from './post.repository.js';

type ListQuery = z.output<typeof listPostsQuerySchema>;
const LOCKED: PostStatus[] = ['PUBLISHING', 'PUBLISHED', 'PARTIALLY_PUBLISHED'];

export const presentPost = async (p: PostWithRelations) => ({
  id: p.id,
  brand: p.brand,
  createdBy: p.createdBy,
  caption: p.caption,
  status: p.status,
  scheduledAt: p.scheduledAt,
  publishedAt: p.publishedAt,
  inQueue: p.inQueue,
  campaignTag: p.campaignTag,
  failureReason: p.failureReason,
  aiGenerationId: p.aiGenerationId,
  createdAt: p.createdAt,
  media: await Promise.all(p.media.map((m) => presentMedia(m.media))),
  targets: p.targets.map((t) => ({
    id: t.id,
    status: t.status,
    caption: t.caption,
    options: t.options,
    externalUrl: t.externalUrl,
    publishedAt: t.publishedAt,
    lastError: t.lastError,
    account: presentAccount(t.socialAccount),
  })),
});

export class PostService {
  constructor(private readonly repo = postRepository) {}

  async list(ws: WorkspaceContext, q: ListQuery) {
    const page = await this.repo.inRange(
      ws.id,
      {
        ...(q.brandId ? { brandId: q.brandId } : {}),
        ...(q.status ? { status: q.status } : {}),
        ...(q.platform ? { targets: { some: { socialAccount: { platform: q.platform } } } } : {}),
        ...(q.from || q.to ? { scheduledAt: { gte: q.from, lte: q.to } } : {}),
      },
      q.page,
      q.pageSize,
    );
    return { ...page, items: await Promise.all(page.items.map(presentPost)) };
  }

  async get(ws: WorkspaceContext, id: string) {
    return presentPost(await this.repo.getFull(ws.id, id));
  }

  /** Validate ownership + every platform's rules. Throws a ValidationError listing all issues. */
  private async validate(ws: WorkspaceContext, input: UpsertPostInput) {
    const [brand, accounts, media] = await Promise.all([
      prisma.brand.findFirst({ where: { id: input.brandId, workspaceId: ws.id } }),
      prisma.socialAccount.findMany({
        where: { id: { in: input.targets.map((t) => t.socialAccountId) }, workspaceId: ws.id },
      }),
      prisma.mediaAsset.findMany({ where: { id: { in: input.mediaIds }, workspaceId: ws.id } }),
    ]);
    if (!brand) throw new BadRequestError('Pick a brand');
    if (accounts.length !== new Set(input.targets.map((t) => t.socialAccountId)).size)
      throw new BadRequestError('Unknown channel selected');
    if (media.length !== input.mediaIds.length) throw new BadRequestError('Unknown media selected');
    const disconnected = accounts.find((a) => a.status !== 'CONNECTED');
    if (disconnected && !input.saveAsDraft)
      throw new BadRequestError(`Reconnect ${disconnected.name} before scheduling`);

    if (!input.saveAsDraft) {
      const issues: ContentIssue[] = input.targets.flatMap((t) => {
        const account = accounts.find((a) => a.id === t.socialAccountId)!;
        return validateForPlatform(account.platform, t.caption ?? input.caption, media);
      });
      const errors = issues.filter((i) => i.severity === 'error');
      if (errors.length) throw new ValidationError(errors, errors[0]!.message);
    }
  }

  private async resolveTiming(
    ws: WorkspaceContext,
    input: UpsertPostInput,
  ): Promise<{ status: PostStatus; scheduledAt: Date | null; inQueue: boolean }> {
    if (input.saveAsDraft)
      return { status: 'DRAFT', scheduledAt: input.scheduledAt ?? null, inQueue: false };
    if (input.publishNow) return { status: 'SCHEDULED', scheduledAt: new Date(), inQueue: false };
    if (input.addToQueue) {
      const slot = await this.nextFreeSlot(ws.id, input.brandId);
      if (!slot) throw new BadRequestError('Set up a posting schedule first, or pick a time');
      return { status: 'SCHEDULED', scheduledAt: slot, inQueue: true };
    }
    if (input.scheduledAt && input.scheduledAt.getTime() < Date.now() - 60_000)
      throw new BadRequestError('Pick a time in the future');
    return { status: 'SCHEDULED', scheduledAt: input.scheduledAt ?? null, inQueue: false };
  }

  /** First slot in the brand's posting schedules that has no post yet. */
  async nextFreeSlot(workspaceId: string, brandId: string): Promise<Date | null> {
    const schedules = await prisma.postingSchedule.findMany({
      where: { workspaceId, brandId, active: true },
    });
    const slots = schedules
      .flatMap((s) => upcomingSlots(s.daysOfWeek, s.timeOfDay, s.timezone, 28))
      .sort((a, b) => a.getTime() - b.getTime());
    if (!slots.length) return null;
    const taken = await prisma.post.findMany({
      where: {
        workspaceId,
        brandId,
        scheduledAt: { in: slots },
        status: { in: ['SCHEDULED', 'PENDING_APPROVAL'] },
      },
      select: { scheduledAt: true },
    });
    const takenSet = new Set(taken.map((t) => t.scheduledAt!.getTime()));
    return slots.find((s) => !takenSet.has(s.getTime())) ?? null;
  }

  private async schedulePublish(postId: string, at: Date | null) {
    if (!at) return null;
    return enqueue(
      'post.publish',
      { postId },
      { startAfter: at, singletonKey: `post:${postId}:${at.getTime()}` },
    );
  }

  async create(ws: WorkspaceContext, user: AuthUser, input: UpsertPostInput) {
    await this.validate(ws, input);
    const timing = await this.resolveTiming(ws, input);
    if (timing.status === 'SCHEDULED') {
      usageService.assertWithinLimit(
        ws,
        'scheduledPostsPerMonth',
        await usageService.get(ws.id, 'scheduledPosts'),
        1,
        'scheduled posts per month',
      );
    }
    // Editors on plans with approval workflows submit for review instead of scheduling directly.
    const needsApproval =
      timing.status === 'SCHEDULED' &&
      ws.plan.features.approvalWorkflows &&
      !hasRole(ws.role, 'ADMIN');

    const post = await prisma.post.create({
      data: {
        workspaceId: ws.id,
        brandId: input.brandId,
        createdById: user.id,
        caption: input.caption,
        status: needsApproval ? 'PENDING_APPROVAL' : timing.status,
        scheduledAt: timing.scheduledAt,
        inQueue: timing.inQueue,
        campaignTag: input.campaignTag,
        aiGenerationId: input.aiGenerationId,
        media: {
          create: input.mediaIds.map((mediaAssetId, position) => ({ mediaAssetId, position })),
        },
        targets: {
          create: input.targets.map((t) => ({
            socialAccountId: t.socialAccountId,
            caption: t.caption,
            options: (t.options ?? {}) as object,
          })),
        },
      },
    });
    if (post.status === 'SCHEDULED') {
      const jobId = await this.schedulePublish(post.id, post.scheduledAt);
      await prisma.post.update({ where: { id: post.id }, data: { jobId } });
      await usageService.increment(ws.id, 'scheduledPosts');
    }
    return this.get(ws, post.id);
  }

  async update(ws: WorkspaceContext, id: string, input: UpsertPostInput) {
    const existing = await this.repo.getById(ws.id, id);
    if (LOCKED.includes(existing.status))
      throw new BadRequestError('This post has already been published');
    await this.validate(ws, input);
    const timing = await this.resolveTiming(ws, input);
    await cancelJob('post.publish', existing.jobId);

    await prisma.$transaction([
      prisma.postMedia.deleteMany({ where: { postId: id } }),
      prisma.postTarget.deleteMany({ where: { postId: id } }),
      prisma.post.update({
        where: { id },
        data: {
          brandId: input.brandId,
          caption: input.caption,
          status: timing.status,
          scheduledAt: timing.scheduledAt,
          inQueue: timing.inQueue,
          campaignTag: input.campaignTag,
          failureReason: null,
          jobId: null,
          media: {
            create: input.mediaIds.map((mediaAssetId, position) => ({ mediaAssetId, position })),
          },
          targets: {
            create: input.targets.map((t) => ({
              socialAccountId: t.socialAccountId,
              caption: t.caption,
              options: (t.options ?? {}) as object,
            })),
          },
        },
      }),
    ]);
    if (timing.status === 'SCHEDULED') {
      const jobId = await this.schedulePublish(id, timing.scheduledAt);
      await prisma.post.update({ where: { id }, data: { jobId } });
      if (existing.status === 'DRAFT') await usageService.increment(ws.id, 'scheduledPosts');
    }
    return this.get(ws, id);
  }

  /** Drag-and-drop on the calendar. */
  async reschedule(ws: WorkspaceContext, id: string, scheduledAt: Date) {
    const post = await this.repo.getById(ws.id, id);
    if (LOCKED.includes(post.status))
      throw new BadRequestError('This post has already been published');
    if (scheduledAt.getTime() < Date.now()) throw new BadRequestError('Pick a time in the future');
    await cancelJob('post.publish', post.jobId);
    const jobId = post.status === 'SCHEDULED' ? await this.schedulePublish(id, scheduledAt) : null;
    await prisma.post.update({ where: { id }, data: { scheduledAt, jobId, inQueue: false } });
    return this.get(ws, id);
  }

  async approve(ws: WorkspaceContext, user: AuthUser, id: string) {
    const post = await this.repo.getById(ws.id, id);
    if (post.status !== 'PENDING_APPROVAL')
      throw new BadRequestError('This post is not awaiting approval');
    let scheduledAt = post.scheduledAt;
    if (!scheduledAt || scheduledAt < new Date())
      scheduledAt = (await this.nextFreeSlot(ws.id, post.brandId)) ?? new Date();
    const jobId = await this.schedulePublish(id, scheduledAt);
    await prisma.post.update({
      where: { id },
      data: {
        status: 'SCHEDULED',
        scheduledAt,
        jobId,
        approvedById: user.id,
        approvedAt: new Date(),
      },
    });
    await usageService.increment(ws.id, 'scheduledPosts');
    return this.get(ws, id);
  }

  async retry(ws: WorkspaceContext, id: string) {
    const post = await this.repo.getById(ws.id, id);
    if (!['FAILED', 'PARTIALLY_PUBLISHED'].includes(post.status))
      throw new BadRequestError('Only failed posts can be retried');
    await prisma.postTarget.updateMany({
      where: { postId: id, status: 'FAILED' },
      data: { status: 'QUEUED', attempts: 0, lastError: null },
    });
    const jobId = await enqueue('post.publish', { postId: id });
    await prisma.post.update({
      where: { id },
      data: { status: 'SCHEDULED', jobId, failureReason: null },
    });
    return this.get(ws, id);
  }

  async duplicate(ws: WorkspaceContext, user: AuthUser, id: string) {
    const p = await this.repo.getFull(ws.id, id);
    const copy = await prisma.post.create({
      data: {
        workspaceId: ws.id,
        brandId: p.brandId,
        createdById: user.id,
        caption: p.caption,
        status: 'DRAFT',
        campaignTag: p.campaignTag,
        media: {
          create: p.media.map((m) => ({ mediaAssetId: m.mediaAssetId, position: m.position })),
        },
        targets: {
          create: p.targets.map((t) => ({
            socialAccountId: t.socialAccountId,
            caption: t.caption,
            options: t.options ?? {},
          })),
        },
      },
    });
    return this.get(ws, copy.id);
  }

  async remove(ws: WorkspaceContext, id: string) {
    const post = await this.repo.getById(ws.id, id);
    await cancelJob('post.publish', post.jobId);
    await this.repo.delete(ws.id, id);
  }

  // ── Posting schedules (autopilot slots) ──
  listSchedules(ws: WorkspaceContext, brandId?: string) {
    return prisma.postingSchedule.findMany({
      where: { workspaceId: ws.id, ...(brandId ? { brandId } : {}) },
      orderBy: { createdAt: 'asc' },
    });
  }

  async createSchedule(
    ws: WorkspaceContext,
    input: {
      brandId: string;
      socialAccountIds: string[];
      daysOfWeek: number[];
      timeOfDay: string;
      timezone: string;
    },
  ) {
    const brand = await prisma.brand.findFirst({
      where: { id: input.brandId, workspaceId: ws.id },
    });
    if (!brand) throw new BadRequestError('Pick a brand');
    const owned = await prisma.socialAccount.count({
      where: { id: { in: input.socialAccountIds }, workspaceId: ws.id },
    });
    if (owned !== new Set(input.socialAccountIds).size)
      throw new BadRequestError('Unknown channel selected');
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: input.timezone });
    } catch {
      throw new BadRequestError('Unknown timezone');
    }
    return prisma.postingSchedule.create({ data: { ...input, workspaceId: ws.id } });
  }

  async deleteSchedule(ws: WorkspaceContext, id: string) {
    await prisma.postingSchedule.deleteMany({ where: { id, workspaceId: ws.id } });
  }
}

export const postService = new PostService();
