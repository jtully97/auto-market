import type { Platform } from '@automarket/shared';
import { prisma } from '../../core/db/prisma.js';
import { logger } from '../../core/logger.js';
import type { WorkspaceContext } from '../../core/http/types.js';
import { getProvider } from '../../integrations/social/registry.js';
import { socialAccountService } from '../social-accounts/social-account.service.js';

interface OverviewQuery {
  brandId?: string;
  platform?: Platform;
  days: number;
}

const engagementsOf = (m: { likes: number; comments: number; shares: number; saves: number }) =>
  m.likes + m.comments + m.shares + m.saves;

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const analyticsService = {
  /**
   * Performance overview. Aggregates the latest metric snapshot of every post
   * published in the window. (At larger scale move this to a nightly rollup table.)
   */
  async overview(ws: WorkspaceContext, query: OverviewQuery) {
    // History beyond 30 days is an advanced-analytics feature.
    const q = {
      ...query,
      days: ws.plan.features.advancedAnalytics ? query.days : Math.min(query.days, 30),
    };
    const since = new Date(Date.now() - q.days * 86400_000);
    const targets = await prisma.postTarget.findMany({
      where: {
        status: 'PUBLISHED',
        publishedAt: { gte: since },
        post: { workspaceId: ws.id, ...(q.brandId ? { brandId: q.brandId } : {}) },
        ...(q.platform ? { socialAccount: { platform: q.platform } } : {}),
      },
      include: {
        metrics: { orderBy: { capturedAt: 'desc' }, take: 1 },
        socialAccount: { select: { id: true, platform: true, name: true } },
        post: {
          select: {
            id: true,
            caption: true,
            media: { select: { media: { select: { kind: true } } } },
          },
        },
      },
    });

    const rows = targets.map((t) => {
      const m = t.metrics[0] ?? {
        impressions: 0,
        reach: 0,
        views: 0,
        likes: 0,
        comments: 0,
        shares: 0,
        saves: 0,
        clicks: 0,
        engagementRate: 0,
      };
      const kinds = t.post.media.map((x) => x.media.kind);
      const format = kinds.includes('VIDEO')
        ? 'video'
        : kinds.length > 1
          ? 'carousel'
          : kinds.length
            ? 'image'
            : 'text';
      return { t, m, format, engagements: engagementsOf(m), publishedAt: t.publishedAt! };
    });

    const sum = (pick: (r: (typeof rows)[number]) => number) =>
      rows.reduce((s, r) => s + pick(r), 0);
    const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

    const group = <K extends string>(key: (r: (typeof rows)[number]) => K) => {
      const map = new Map<K, typeof rows>();
      for (const r of rows) map.set(key(r), [...(map.get(key(r)) ?? []), r]);
      return [...map.entries()].map(([k, rs]) => ({
        key: k,
        posts: rs.length,
        impressions: rs.reduce((s, r) => s + r.m.impressions, 0),
        engagements: rs.reduce((s, r) => s + r.engagements, 0),
        engagementRate: avg(rs.map((r) => r.m.engagementRate)),
      }));
    };

    const daily = new Map<
      string,
      { date: string; impressions: number; engagements: number; posts: number }
    >();
    for (let i = q.days - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400_000).toISOString().slice(0, 10);
      daily.set(d, { date: d, impressions: 0, engagements: 0, posts: 0 });
    }
    for (const r of rows) {
      const d = daily.get(r.publishedAt.toISOString().slice(0, 10));
      if (d) {
        d.impressions += r.m.impressions;
        d.engagements += r.engagements;
        d.posts += 1;
      }
    }

    const slots = group(
      (r) =>
        `${DAYS[r.publishedAt.getUTCDay()]} ${String(r.publishedAt.getUTCHours()).padStart(2, '0')}:00 UTC`,
    )
      .filter((s) => s.posts >= 2)
      .sort((a, b) => b.engagementRate - a.engagementRate)
      .slice(0, 5);

    const followers = await this.followerTrend(ws.id, q.days, q.platform);

    return {
      range: { since, days: q.days },
      totals: {
        posts: rows.length,
        impressions: sum((r) => r.m.impressions),
        reach: sum((r) => r.m.reach),
        views: sum((r) => r.m.views),
        engagements: sum((r) => r.engagements),
        clicks: sum((r) => r.m.clicks),
        engagementRate: avg(rows.map((r) => r.m.engagementRate)),
        followers: followers.current,
        followerGrowth: followers.growth,
      },
      byPlatform: group((r) => r.t.socialAccount.platform),
      byFormat: group((r) => r.format),
      bestTimes: slots,
      timeseries: [...daily.values()],
      followerSeries: followers.series,
      topPosts: rows
        .sort((a, b) => b.m.engagementRate - a.m.engagementRate)
        .slice(0, 10)
        .map((r) => ({
          postId: r.t.post.id,
          targetId: r.t.id,
          platform: r.t.socialAccount.platform,
          account: r.t.socialAccount.name,
          caption: (r.t.caption ?? r.t.post.caption).slice(0, 200),
          url: r.t.externalUrl,
          format: r.format,
          publishedAt: r.publishedAt,
          ...r.m,
          engagements: r.engagements,
        })),
    };
  },

  async followerTrend(workspaceId: string, days: number, platform?: Platform) {
    const since = new Date(Date.now() - days * 86400_000);
    const metrics = await prisma.accountMetric.findMany({
      where: {
        date: { gte: since },
        socialAccount: { workspaceId, status: 'CONNECTED', ...(platform ? { platform } : {}) },
      },
      orderBy: { date: 'asc' },
    });
    const byDate = new Map<string, number>();
    const latestByAccount = new Map<string, number>();
    const firstByAccount = new Map<string, number>();
    for (const m of metrics) {
      const d = m.date.toISOString().slice(0, 10);
      byDate.set(d, (byDate.get(d) ?? 0) + m.followers);
      if (!firstByAccount.has(m.socialAccountId))
        firstByAccount.set(m.socialAccountId, m.followers);
      latestByAccount.set(m.socialAccountId, m.followers);
    }
    const current = [...latestByAccount.values()].reduce((a, b) => a + b, 0);
    const start = [...firstByAccount.values()].reduce((a, b) => a + b, 0);
    return {
      current,
      growth: current - start,
      series: [...byDate.entries()].map(([date, followers]) => ({ date, followers })),
    };
  },

  async postMetrics(ws: WorkspaceContext, postId: string) {
    return prisma.postTarget.findMany({
      where: { postId, post: { workspaceId: ws.id } },
      select: {
        id: true,
        status: true,
        externalUrl: true,
        socialAccount: { select: { platform: true, name: true } },
        metrics: { orderBy: { capturedAt: 'asc' } },
      },
    });
  },

  /** Cron: snapshot metrics for posts published in the last 30 days. */
  async syncPostMetrics() {
    const since = new Date(Date.now() - 30 * 86400_000);
    const targets = await prisma.postTarget.findMany({
      where: {
        status: 'PUBLISHED',
        publishedAt: { gte: since },
        externalPostId: { not: null },
        socialAccount: { status: 'CONNECTED' },
      },
      include: { socialAccount: true },
    });
    let ok = 0;
    for (const t of targets) {
      try {
        const creds = await socialAccountService.credentials(t.socialAccount);
        const m = await getProvider(t.socialAccount.platform).fetchPostMetrics(
          creds,
          t.externalPostId!,
        );
        const denominator = m.reach || m.impressions || m.views;
        await prisma.postMetric.create({
          data: {
            postTargetId: t.id,
            ...m,
            engagementRate: denominator ? engagementsOf(m) / denominator : 0,
          },
        });
        ok++;
      } catch (err) {
        logger.warn({ err, targetId: t.id }, 'metric sync failed');
      }
    }
    logger.info({ ok, total: targets.length }, 'post metrics synced');
  },

  async syncAccountMetrics() {
    const accounts = await prisma.socialAccount.findMany({ where: { status: 'CONNECTED' } });
    const today = new Date(new Date().toISOString().slice(0, 10));
    for (const a of accounts) {
      try {
        const m = await getProvider(a.platform).fetchAccountMetrics(
          await socialAccountService.credentials(a),
        );
        await prisma.accountMetric.upsert({
          where: { socialAccountId_date: { socialAccountId: a.id, date: today } },
          create: {
            socialAccountId: a.id,
            date: today,
            followers: m.followers,
            impressions: m.impressions ?? 0,
            reach: m.reach ?? 0,
            profileViews: m.profileViews ?? 0,
          },
          update: {
            followers: m.followers,
            impressions: m.impressions ?? 0,
            reach: m.reach ?? 0,
            profileViews: m.profileViews ?? 0,
          },
        });
      } catch (err) {
        logger.warn({ err, accountId: a.id }, 'account metric sync failed');
      }
    }
  },
};
