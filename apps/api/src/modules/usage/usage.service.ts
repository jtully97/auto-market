import type { PlanFeatures, PlanLimits } from '@automarket/shared';
import { prisma } from '../../core/db/prisma.js';
import { PlanLimitError } from '../../core/errors.js';
import type { WorkspaceContext } from '../../core/http/types.js';

export type UsageMetric = 'scheduledPosts' | 'emailsSent';

const monthStart = (d = new Date()) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));

/** Plan enforcement in one place: feature gates, count limits and monthly meters. */
export const usageService = {
  requireFeature(ws: WorkspaceContext, feature: keyof PlanFeatures, label: string) {
    if (!ws.plan.features[feature]) {
      throw new PlanLimitError(
        `${label} is not included in the ${ws.plan.name} plan. Upgrade to unlock it.`,
        {
          limit: feature,
          planId: ws.plan.id,
        },
      );
    }
  },

  assertWithinLimit(
    ws: WorkspaceContext,
    limit: keyof PlanLimits,
    current: number,
    adding = 1,
    label?: string,
  ) {
    const max = ws.plan.limits[limit];
    if (max !== null && current + adding > max) {
      throw new PlanLimitError(
        `Your ${ws.plan.name} plan allows ${max} ${label ?? limit}. Upgrade for more.`,
        {
          limit,
          planId: ws.plan.id,
        },
      );
    }
  },

  async get(workspaceId: string, metric: UsageMetric) {
    const row = await prisma.usageCounter.findUnique({
      where: { workspaceId_metric_periodStart: { workspaceId, metric, periodStart: monthStart() } },
    });
    return row?.count ?? 0;
  },

  async increment(workspaceId: string, metric: UsageMetric, by = 1) {
    await prisma.usageCounter.upsert({
      where: { workspaceId_metric_periodStart: { workspaceId, metric, periodStart: monthStart() } },
      create: { workspaceId, metric, periodStart: monthStart(), count: by },
      update: { count: { increment: by } },
    });
  },

  async summary(ws: WorkspaceContext) {
    const [scheduledPosts, emailsSent, socialAccounts, brands, contacts, seats] = await Promise.all(
      [
        this.get(ws.id, 'scheduledPosts'),
        this.get(ws.id, 'emailsSent'),
        prisma.socialAccount.count({
          where: { workspaceId: ws.id, status: { not: 'DISCONNECTED' } },
        }),
        prisma.brand.count({ where: { workspaceId: ws.id } }),
        prisma.contact.count({ where: { workspaceId: ws.id } }),
        prisma.membership.count({ where: { workspaceId: ws.id } }),
      ],
    );
    const l = ws.plan.limits;
    return {
      planId: ws.plan.id,
      periodStart: monthStart(),
      meters: {
        scheduledPosts: { used: scheduledPosts, limit: l.scheduledPostsPerMonth },
        emailsSent: { used: emailsSent, limit: l.emailsPerMonth },
        socialAccounts: { used: socialAccounts, limit: l.socialAccounts },
        brands: { used: brands, limit: l.brands },
        contacts: { used: contacts, limit: l.contacts },
        seats: { used: seats, limit: l.seats },
      },
    };
  },
};
