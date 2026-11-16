'use client';

import type {
  BrandProfileInput,
  ContactInput,
  EmailCampaignInput,
  UpsertPostInput,
} from '@automarket/shared';
import { useQuery } from '@tanstack/react-query';
import { api, type Query } from './client';
import { createResource } from './resource';
import type {
  AiGeneration,
  AnalyticsOverview,
  Brand,
  Campaign,
  Contact,
  ContactList,
  CreditBalance,
  CreditTransaction,
  Dashboard,
  Media,
  PlatformInfo,
  Post,
  PostingSchedule,
  SocialAccount,
  Workspace,
} from './types';

export const brands = createResource<Brand, BrandProfileInput>('brands', '/brands');
export const posts = createResource<Post, UpsertPostInput>('posts', '/posts', {
  updateMethod: 'PUT',
});
export const media = createResource<Media>('media', '/media');
export const generations = createResource<AiGeneration>('generations', '/ai/generations');
export const contacts = createResource<Contact, ContactInput>('contacts', '/contacts');
export const contactLists = createResource<ContactList, { name: string; description?: string }>(
  'contact-lists',
  '/contact-lists',
);
export const campaigns = createResource<Campaign, EmailCampaignInput>('campaigns', '/campaigns', {
  updateMethod: 'PUT',
});
export const schedules = createResource<PostingSchedule>('schedules', '/posts/schedules');

const useGet = <T>(key: unknown[], path: string, query?: Query, enabled = true) =>
  useQuery({ queryKey: [...key, query ?? {}], queryFn: () => api<T>(path, { query }), enabled });

export const useWorkspace = () => useGet<Workspace>(['workspace'], '/workspaces/current');
export const useDashboard = () => useGet<Dashboard>(['dashboard'], '/dashboard');
export const useSocialAccounts = (brandId?: string) =>
  useGet<SocialAccount[]>(['social-accounts'], '/social-accounts', { brandId });
export const usePlatforms = () =>
  useGet<PlatformInfo[]>(['platforms'], '/social-accounts/platforms');
export const useCredits = () => useGet<CreditBalance>(['credits'], '/credits/balance');
export const useCreditHistory = (page = 1) =>
  useGet<{ items: CreditTransaction[]; totalPages: number }>(
    ['credits', 'history'],
    '/credits/history',
    { page },
  );
export const useCreditPricing = () =>
  useGet<{
    actions: { action: string; label: string; credits: number }[];
    packs: { id: string; name: string; credits: number; price: number }[];
  }>(['credits', 'pricing'], '/credits/pricing');
export const useAnalytics = (query: Query) =>
  useGet<AnalyticsOverview>(['analytics'], '/analytics/overview', query);
export const useSchedules = (brandId?: string) =>
  useGet<PostingSchedule[]>(['schedules'], '/posts/schedules', { brandId });
export const useMembers = () =>
  useGet<{
    members: { id: string; role: string; user: { id: string; name: string; email: string } }[];
    invitations: { id: string; email: string; role: string }[];
  }>(['members'], '/workspaces/current/members');
