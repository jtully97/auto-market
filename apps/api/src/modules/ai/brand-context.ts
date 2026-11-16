import { prisma } from '../../core/db/prisma.js';
import { BadRequestError, NotFoundError } from '../../core/errors.js';
import type { Brand } from '../../generated/prisma/client.js';

export const loadBrandForAi = async (workspaceId: string, brandId: string) => {
  const brand = await prisma.brand.findFirst({ where: { id: brandId, workspaceId } });
  if (!brand) throw new NotFoundError('Brand');
  if (!brand.aiOptIn) {
    throw new BadRequestError(
      'AI content is turned off for this brand. Turn it on in Brand settings to use AI.',
    );
  }
  return brand;
};

/** Top performing captions — lets generations learn from what already works for this brand. */
const topPerformers = async (brandId: string) => {
  const since = new Date(Date.now() - 90 * 86400_000);
  const targets = await prisma.postTarget.findMany({
    where: { post: { brandId }, status: 'PUBLISHED', publishedAt: { gte: since } },
    include: {
      metrics: { orderBy: { capturedAt: 'desc' }, take: 1 },
      socialAccount: { select: { platform: true } },
      post: { select: { caption: true } },
    },
    take: 200,
  });
  return targets
    .map((t) => ({
      platform: t.socialAccount.platform,
      caption: t.caption ?? t.post.caption,
      er: t.metrics[0]?.engagementRate ?? 0,
    }))
    .filter((t) => t.er > 0)
    .sort((a, b) => b.er - a.er)
    .slice(0, 5);
};

const list = (label: string, items: string[]) =>
  items.length ? `${label}: ${items.join(', ')}` : '';

/**
 * The "lane" context injected into every generation: who the brand is, who it
 * talks to, how it sounds, what the AI analyst learned about the niche, and
 * which of its own posts performed best.
 */
export const buildBrandContext = async (brand: Brand) => {
  const insights = brand.insights as {
    summary?: string;
    contentPillars?: { name: string }[];
    trends?: { title: string }[];
  } | null;
  const top = await topPerformers(brand.id);
  return [
    `Brand: ${brand.name}`,
    brand.website && `Website: ${brand.website}`,
    brand.industry && `Industry: ${brand.industry}`,
    brand.niche && `Niche / lane: ${brand.niche}`,
    brand.description && `About: ${brand.description}`,
    brand.targetAudience && `Target audience: ${brand.targetAudience}`,
    brand.voice && `Brand voice: ${brand.voice}`,
    list('Goals', brand.goals),
    list('Keywords', brand.keywords),
    list('Competitors', brand.competitors),
    list('Never mention', brand.avoidTopics),
    insights?.summary && `Analyst summary of the niche: ${insights.summary}`,
    insights?.contentPillars?.length &&
      `Content pillars: ${insights.contentPillars.map((p) => p.name).join(', ')}`,
    insights?.trends?.length && `Current trends: ${insights.trends.map((t) => t.title).join('; ')}`,
    top.length &&
      `Best performing recent posts (learn from their style):\n${top.map((t) => `- [${t.platform}, ER ${(t.er * 100).toFixed(1)}%] ${t.caption.slice(0, 280)}`).join('\n')}`,
  ]
    .filter(Boolean)
    .join('\n');
};

export const SYSTEM_PROMPT = `You are AutoMarket's senior social media strategist and copywriter.
You write scroll-stopping, platform-native content that sounds like the brand, never generic.
Rules: respect each platform's norms and limits; lead with a strong hook; one clear call to action;
no false claims, no fabricated stats or testimonials; avoid topics the brand lists as off-limits;
use hashtags sparingly and only when they help discovery on that platform.`;
