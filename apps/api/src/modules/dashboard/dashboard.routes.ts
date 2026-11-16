import { prisma } from '../../core/db/prisma.js';
import { defineRoutes } from '../../core/http/router.js';
import { creditService } from '../credits/credit.service.js';
import { presentPost } from '../posts/post.service.js';
import { postInclude } from '../posts/post.repository.js';
import { usageService } from '../usage/usage.service.js';

/** One call powers the home screen: what's going out, what needs attention, how it's doing. */
export default defineRoutes('/dashboard', (r) => {
  r.get('/', {}, async ({ workspace }) => {
    const now = new Date();
    const week = new Date(Date.now() + 7 * 86400_000);
    const [
      upcoming,
      needsApproval,
      failed,
      accounts,
      credits,
      usage,
      published30,
      brands,
      nextCampaign,
    ] = await Promise.all([
      prisma.post.findMany({
        where: {
          workspaceId: workspace.id,
          status: 'SCHEDULED',
          scheduledAt: { gte: now, lte: week },
        },
        include: postInclude,
        orderBy: { scheduledAt: 'asc' },
        take: 8,
      }),
      prisma.post.count({ where: { workspaceId: workspace.id, status: 'PENDING_APPROVAL' } }),
      prisma.post.count({
        where: { workspaceId: workspace.id, status: { in: ['FAILED', 'PARTIALLY_PUBLISHED'] } },
      }),
      prisma.socialAccount.findMany({
        where: { workspaceId: workspace.id, status: { not: 'DISCONNECTED' } },
        select: { id: true, platform: true, name: true, status: true, avatarUrl: true },
      }),
      creditService.balance(workspace.id),
      usageService.summary(workspace),
      prisma.post.count({
        where: {
          workspaceId: workspace.id,
          status: 'PUBLISHED',
          publishedAt: { gte: new Date(Date.now() - 30 * 86400_000) },
        },
      }),
      prisma.brand.findMany({
        where: { workspaceId: workspace.id },
        select: {
          id: true,
          name: true,
          aiOptIn: true,
          niche: true,
          insightsUpdatedAt: true,
          autopilotEnabled: true,
        },
      }),
      prisma.emailCampaign.findFirst({
        where: { workspaceId: workspace.id, status: 'SCHEDULED' },
        orderBy: { scheduledAt: 'asc' },
        select: { id: true, name: true, scheduledAt: true },
      }),
    ]);
    const scheduledThisWeek = await prisma.post.count({
      where: {
        workspaceId: workspace.id,
        status: 'SCHEDULED',
        scheduledAt: { gte: now, lte: week },
      },
    });

    const checklist = [
      {
        key: 'brand',
        label: 'Describe your brand and niche',
        done: brands.some((b) => Boolean(b.niche)),
      },
      { key: 'channels', label: 'Connect your social channels', done: accounts.length > 0 },
      {
        key: 'post',
        label: 'Schedule your first post',
        done: scheduledThisWeek > 0 || published30 > 0,
      },
      { key: 'ai', label: 'Turn on AI content (optional)', done: brands.some((b) => b.aiOptIn) },
      {
        key: 'analyst',
        label: 'Run the AI analyst on your niche',
        done: brands.some((b) => b.insightsUpdatedAt),
      },
    ];

    return {
      upcoming: await Promise.all(upcoming.map(presentPost)),
      scheduledThisWeek,
      needsApproval,
      failed,
      published30,
      accounts,
      reconnectNeeded: accounts.filter((a) => a.status !== 'CONNECTED').length,
      credits,
      usage,
      brands,
      nextCampaign,
      checklist,
    };
  });
});
