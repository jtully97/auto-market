/**
 * Subscription plans — the single source of truth for pricing, limits and
 * monthly credit allowances. Used by the API (enforcement, Stripe sync) and
 * the web app (pricing page, upgrade prompts).
 *
 * Business model: HYBRID.
 *   - A subscription unlocks platform features + limits and grants a monthly
 *     credit allowance that resets each billing cycle (no rollover).
 *   - Credit packs can be bought any time; pack credits last 12 months.
 *   - Every AI action costs credits (see credits.ts). Credits are reserved
 *     before a provider call and only captured on success, so failed
 *     generations are never billed and balances can never go negative.
 */
export const PLAN_IDS = ['free', 'creator', 'business', 'agency'] as const;
export type PlanId = (typeof PLAN_IDS)[number];

export type BillingInterval = 'month' | 'year';

export interface PlanLimits {
  socialAccounts: number;
  brands: number;
  seats: number;
  /** Scheduled posts per month; null = unlimited. */
  scheduledPostsPerMonth: number | null;
  contacts: number;
  emailsPerMonth: number;
  /** Concurrent AI generations in flight (protects against burst abuse). */
  maxConcurrentGenerations: number;
  /** Hard daily ceiling on credits spent, protects against runaway usage. */
  dailyCreditSpendCap: number;
}

export interface PlanFeatures {
  aiText: boolean;
  aiImage: boolean;
  aiVideo: boolean;
  aiAnalyst: boolean;
  advancedAnalytics: boolean;
  emailCampaigns: boolean;
  approvalWorkflows: boolean;
  whiteLabelReports: boolean;
}

export interface PlanDefinition {
  id: PlanId;
  name: string;
  tagline: string;
  /** Prices in USD cents. */
  priceMonthly: number;
  priceYearly: number;
  monthlyCredits: number;
  limits: PlanLimits;
  features: PlanFeatures;
  highlighted?: boolean;
  /** Stripe Price lookup keys — prices are created by `pnpm --filter api stripe:sync`. */
  stripeLookupKeys: { month: string; year: string } | null;
}

export const PLANS: Record<PlanId, PlanDefinition> = {
  free: {
    id: 'free',
    name: 'Free',
    tagline: 'Try autopilot on a few channels',
    priceMonthly: 0,
    priceYearly: 0,
    monthlyCredits: 100,
    limits: {
      socialAccounts: 3,
      brands: 1,
      seats: 1,
      scheduledPostsPerMonth: 30,
      contacts: 250,
      emailsPerMonth: 500,
      maxConcurrentGenerations: 1,
      dailyCreditSpendCap: 50,
    },
    features: {
      aiText: true,
      aiImage: true,
      aiVideo: false,
      aiAnalyst: false,
      advancedAnalytics: false,
      emailCampaigns: true,
      approvalWorkflows: false,
      whiteLabelReports: false,
    },
    stripeLookupKeys: null,
  },
  creator: {
    id: 'creator',
    name: 'Creator',
    tagline: 'For solo creators and small businesses',
    priceMonthly: 2900,
    priceYearly: 29000,
    monthlyCredits: 1500,
    limits: {
      socialAccounts: 8,
      brands: 1,
      seats: 1,
      scheduledPostsPerMonth: null,
      contacts: 2500,
      emailsPerMonth: 10000,
      maxConcurrentGenerations: 2,
      dailyCreditSpendCap: 600,
    },
    features: {
      aiText: true,
      aiImage: true,
      aiVideo: true,
      aiAnalyst: true,
      advancedAnalytics: false,
      emailCampaigns: true,
      approvalWorkflows: false,
      whiteLabelReports: false,
    },
    stripeLookupKeys: { month: 'creator_monthly', year: 'creator_yearly' },
  },
  business: {
    id: 'business',
    name: 'Business',
    tagline: 'For growing teams running multiple channels',
    priceMonthly: 7900,
    priceYearly: 79000,
    monthlyCredits: 5000,
    highlighted: true,
    limits: {
      socialAccounts: 25,
      brands: 3,
      seats: 3,
      scheduledPostsPerMonth: null,
      contacts: 15000,
      emailsPerMonth: 50000,
      maxConcurrentGenerations: 4,
      dailyCreditSpendCap: 2000,
    },
    features: {
      aiText: true,
      aiImage: true,
      aiVideo: true,
      aiAnalyst: true,
      advancedAnalytics: true,
      emailCampaigns: true,
      approvalWorkflows: true,
      whiteLabelReports: false,
    },
    stripeLookupKeys: { month: 'business_monthly', year: 'business_yearly' },
  },
  agency: {
    id: 'agency',
    name: 'Agency',
    tagline: 'For agencies managing many brands',
    priceMonthly: 19900,
    priceYearly: 199000,
    monthlyCredits: 15000,
    limits: {
      socialAccounts: 75,
      brands: 15,
      seats: 10,
      scheduledPostsPerMonth: null,
      contacts: 75000,
      emailsPerMonth: 250000,
      maxConcurrentGenerations: 8,
      dailyCreditSpendCap: 6000,
    },
    features: {
      aiText: true,
      aiImage: true,
      aiVideo: true,
      aiAnalyst: true,
      advancedAnalytics: true,
      emailCampaigns: true,
      approvalWorkflows: true,
      whiteLabelReports: true,
    },
    stripeLookupKeys: { month: 'agency_monthly', year: 'agency_yearly' },
  },
};

export const getPlan = (id: string | null | undefined): PlanDefinition =>
  PLANS[(PLAN_IDS as readonly string[]).includes(id ?? '') ? (id as PlanId) : 'free'];

export interface CreditPack {
  id: string;
  name: string;
  credits: number;
  /** USD cents */
  price: number;
  stripeLookupKey: string;
}

/** One-off credit top-ups. Pack credits expire 12 months after purchase. */
export const CREDIT_PACKS: CreditPack[] = [
  {
    id: 'pack_1k',
    name: '1,000 credits',
    credits: 1000,
    price: 1500,
    stripeLookupKey: 'credits_1000',
  },
  {
    id: 'pack_5k',
    name: '5,000 credits',
    credits: 5000,
    price: 6000,
    stripeLookupKey: 'credits_5000',
  },
  {
    id: 'pack_15k',
    name: '15,000 credits',
    credits: 15000,
    price: 15000,
    stripeLookupKey: 'credits_15000',
  },
];

export const PACK_CREDIT_EXPIRY_DAYS = 365;
