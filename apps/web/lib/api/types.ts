import type { Platform, PlanDefinition, PostStatus } from '@automarket/shared';

export type Role = 'OWNER' | 'ADMIN' | 'EDITOR' | 'VIEWER';

export interface Me {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  workspaces: { id: string; name: string; slug: string; planId: string; role: Role }[];
}

export interface Meter {
  used: number;
  limit: number | null;
}

export interface CreditBalance {
  available: number;
  subscription: number;
  pack: number;
  held: number;
  nextExpiry: { expiresAt: string; remaining: number } | null;
}

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  planId: string;
  billingInterval: 'month' | 'year' | null;
  subscriptionStatus: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  role: Role;
  plan: PlanDefinition;
  usage: {
    meters: Record<
      'scheduledPosts' | 'emailsSent' | 'socialAccounts' | 'brands' | 'contacts' | 'seats',
      Meter
    >;
  };
  credits: CreditBalance;
}

export interface Brand {
  id: string;
  name: string;
  website: string | null;
  industry: string | null;
  niche: string | null;
  description: string | null;
  targetAudience: string | null;
  voice: string | null;
  competitors: string[];
  goals: string[];
  keywords: string[];
  avoidTopics: string[];
  aiOptIn: boolean;
  autopilotEnabled: boolean;
  insights: NicheReport | null;
  insightsUpdatedAt: string | null;
}

export interface SocialAccount {
  id: string;
  platform: Platform;
  name: string;
  handle: string | null;
  avatarUrl: string | null;
  brandId: string | null;
  status: 'CONNECTED' | 'EXPIRED' | 'ERROR' | 'DISCONNECTED';
  lastError: string | null;
}

export interface PlatformInfo {
  platform: Platform;
  label: string;
  color: string;
  configured: boolean;
  captionMaxLength: number;
}

export interface Media {
  id: string;
  kind: 'IMAGE' | 'VIDEO';
  source: 'UPLOAD' | 'AI';
  url: string;
  mimeType: string;
  sizeBytes: number | null;
  createdAt: string;
}

export interface PostTarget {
  id: string;
  status: 'QUEUED' | 'PUBLISHING' | 'PUBLISHED' | 'FAILED' | 'SKIPPED';
  caption: string | null;
  externalUrl: string | null;
  publishedAt: string | null;
  lastError: string | null;
  account: SocialAccount;
}

export interface Post {
  id: string;
  brand: { id: string; name: string };
  createdBy: { id: string; name: string };
  caption: string;
  status: PostStatus;
  scheduledAt: string | null;
  publishedAt: string | null;
  inQueue: boolean;
  campaignTag: string | null;
  failureReason: string | null;
  media: Media[];
  targets: PostTarget[];
  createdAt: string;
}

export interface PostingSchedule {
  id: string;
  brandId: string;
  socialAccountIds: string[];
  daysOfWeek: number[];
  timeOfDay: string;
  timezone: string;
  active: boolean;
}

export interface AiGeneration<O = unknown> {
  id: string;
  type: 'TEXT' | 'IMAGE' | 'VIDEO' | 'ANALYST';
  action: string;
  provider: string;
  status: 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELED';
  prompt: string;
  output: O;
  creditsCharged: number;
  error: string | null;
  createdAt: string;
  media: Media[];
}

export interface CaptionOutput {
  variants: { hook: string; caption: string; hashtags: string[]; cta: string }[];
}
export interface ContentPlanOutput {
  ideas: {
    dayOffset: number;
    platforms: Platform[];
    format: string;
    hook: string;
    caption: string;
    visualPrompt: string;
    rationale: string;
  }[];
}
export interface EmailOutput {
  subjectLines: string[];
  previewText: string;
  html: string;
  plainText: string;
}

export interface NicheReport {
  summary: string;
  audience: { personas: { name: string; description: string; painPoints: string[] }[] };
  trends: { title: string; description: string; relevance: 'high' | 'medium' | 'low' }[];
  contentPillars: { name: string; description: string; exampleIdeas: string[] }[];
  competitorAngles: { competitor: string; whatWorks: string; gapToExploit: string }[];
  platformStrategy: {
    platform: Platform;
    focus: string;
    cadencePerWeek: number;
    bestTimes: string[];
  }[];
  hashtags: string[];
  opportunities: string[];
  sources: string[];
}

export interface PerformanceInsights {
  headline: string;
  whatsWorking: string[];
  whatsNot: string[];
  recommendations: { title: string; detail: string; impact: 'high' | 'medium' | 'low' }[];
  nextWeekIdeas: string[];
}

export interface GroupStat {
  key: string;
  posts: number;
  impressions: number;
  engagements: number;
  engagementRate: number;
}

export interface AnalyticsOverview {
  range: { since: string; days: number };
  totals: {
    posts: number;
    impressions: number;
    reach: number;
    views: number;
    engagements: number;
    clicks: number;
    engagementRate: number;
    followers: number;
    followerGrowth: number;
  };
  byPlatform: GroupStat[];
  byFormat: GroupStat[];
  bestTimes: GroupStat[];
  timeseries: { date: string; impressions: number; engagements: number; posts: number }[];
  followerSeries: { date: string; followers: number }[];
  topPosts: {
    postId: string;
    targetId: string;
    platform: Platform;
    account: string;
    caption: string;
    url: string | null;
    format: string;
    publishedAt: string;
    impressions: number;
    reach: number;
    likes: number;
    comments: number;
    shares: number;
    engagements: number;
    engagementRate: number;
  }[];
}

export interface Contact {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  tags: string[];
  status: 'SUBSCRIBED' | 'UNSUBSCRIBED' | 'BOUNCED' | 'COMPLAINED';
  lists: { id: string; name: string }[];
  createdAt: string;
}

export interface ContactList {
  id: string;
  name: string;
  description: string | null;
  memberCount: number;
  createdAt: string;
}

export interface ContactImport {
  id: string;
  fileName: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  totalRows: number;
  imported: number;
  updated: number;
  skipped: number;
  errors: { row: number; message: string }[];
}

export interface Campaign {
  id: string;
  brandId: string;
  name: string;
  subject: string;
  previewText: string | null;
  fromName: string;
  replyTo: string | null;
  html: string;
  design: unknown;
  status: 'DRAFT' | 'SCHEDULED' | 'SENDING' | 'SENT' | 'CANCELED' | 'FAILED';
  scheduledAt: string | null;
  sentAt: string | null;
  recipientsCount: number;
  sentCount: number;
  openCount: number;
  clickCount: number;
  unsubscribeCount: number;
  listIds: string[];
  lists?: { id: string; name: string }[];
  createdAt: string;
}

export interface Dashboard {
  upcoming: Post[];
  scheduledThisWeek: number;
  needsApproval: number;
  failed: number;
  published30: number;
  accounts: Pick<SocialAccount, 'id' | 'platform' | 'name' | 'status' | 'avatarUrl'>[];
  reconnectNeeded: number;
  credits: CreditBalance;
  brands: Pick<
    Brand,
    'id' | 'name' | 'aiOptIn' | 'niche' | 'insightsUpdatedAt' | 'autopilotEnabled'
  >[];
  nextCampaign: { id: string; name: string; scheduledAt: string } | null;
  checklist: { key: string; label: string; done: boolean }[];
}

export interface CreditTransaction {
  id: string;
  type: string;
  amount: number;
  balanceAfter: number;
  description: string;
  createdAt: string;
}
