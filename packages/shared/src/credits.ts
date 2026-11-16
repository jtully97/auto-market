/**
 * Credit costs for every AI action.
 *
 * Margin guardrail: a credit must never cost us more than CREDIT_COGS_CEILING_USD
 * in provider fees. Each action's credit price is derived from its estimated
 * provider cost: credits = ceil(estimatedCostUsd / CREDIT_COGS_CEILING_USD).
 *
 * Retail value of a credit is $0.010–$0.019 (subscriptions and packs), so with a
 * $0.005 ceiling the worst-case gross margin on AI usage is ~50% (largest pack)
 * and ~62–75% on subscription allowances. Recalibrate `estimatedCostUsd` from
 * real provider invoices (the API records actual cost per generation in
 * `AiGeneration.providerCostUsd`) — the /admin/ai-margins report flags drift.
 */
export const CREDIT_COGS_CEILING_USD = 0.005;

export const AI_ACTIONS = [
  'text.caption',
  'text.hashtags',
  'text.repurpose',
  'text.email',
  'text.contentPlan',
  'image.openai.standard',
  'image.openai.hd',
  'image.higgsfield.standard',
  'image.higgsfield.hd',
  'video.higgsfield.5s',
  'video.higgsfield.10s',
  'video.higgsfield.15s',
  'analyst.nicheReport',
  'analyst.performanceInsights',
  'email.overage100',
] as const;
export type AiAction = (typeof AI_ACTIONS)[number];

export interface AiActionPricing {
  label: string;
  /** Best estimate of provider cost in USD. */
  estimatedCostUsd: number;
}

export const AI_ACTION_PRICING: Record<AiAction, AiActionPricing> = {
  'text.caption': { label: 'Caption + hook', estimatedCostUsd: 0.004 },
  'text.hashtags': { label: 'Hashtag set', estimatedCostUsd: 0.002 },
  'text.repurpose': { label: 'Repurpose for each platform', estimatedCostUsd: 0.01 },
  'text.email': { label: 'Email draft', estimatedCostUsd: 0.01 },
  'text.contentPlan': { label: 'Weekly content plan', estimatedCostUsd: 0.03 },
  'image.openai.standard': { label: 'Image (standard)', estimatedCostUsd: 0.05 },
  'image.openai.hd': { label: 'Image (HD)', estimatedCostUsd: 0.17 },
  'image.higgsfield.standard': { label: 'Higgsfield image (720p)', estimatedCostUsd: 0.06 },
  'image.higgsfield.hd': { label: 'Higgsfield image (1080p)', estimatedCostUsd: 0.1 },
  'video.higgsfield.5s': { label: 'Video (5s)', estimatedCostUsd: 0.5 },
  'video.higgsfield.10s': { label: 'Video (10s)', estimatedCostUsd: 1.0 },
  'video.higgsfield.15s': { label: 'Video (15s)', estimatedCostUsd: 1.5 },
  'analyst.nicheReport': { label: 'AI analyst niche report', estimatedCostUsd: 0.1 },
  'analyst.performanceInsights': { label: 'Performance insights', estimatedCostUsd: 0.03 },
  'email.overage100': { label: '100 emails over plan quota', estimatedCostUsd: 0.05 },
};

export const creditsFor = (action: AiAction, quantity = 1): number =>
  Math.max(1, Math.ceil(AI_ACTION_PRICING[action].estimatedCostUsd / CREDIT_COGS_CEILING_USD)) *
  quantity;

/** Video resolution multiplier applied on top of the duration price. */
export const VIDEO_RESOLUTION_MULTIPLIER = { '480p': 0.75, '720p': 1, '1080p': 1.5 } as const;
export type VideoResolution = keyof typeof VIDEO_RESOLUTION_MULTIPLIER;

export const videoCredits = (durationSeconds: 5 | 10 | 15, resolution: VideoResolution): number =>
  Math.ceil(
    creditsFor(`video.higgsfield.${durationSeconds}s` as AiAction) *
      VIDEO_RESOLUTION_MULTIPLIER[resolution],
  );
