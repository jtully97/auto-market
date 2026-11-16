import { z } from 'zod';

export const WORKSPACE_ROLES = ['OWNER', 'ADMIN', 'EDITOR', 'VIEWER'] as const;
export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

export const createWorkspaceSchema = z.object({ name: z.string().trim().min(1).max(100) });
export const updateWorkspaceSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  timezone: z.string().max(64).optional(),
});
export const inviteMemberSchema = z.object({
  email: z.email().toLowerCase(),
  role: z.enum(WORKSPACE_ROLES).exclude(['OWNER']),
});

export const brandProfileSchema = z.object({
  name: z.string().trim().min(1).max(100),
  website: z.url().optional().or(z.literal('')),
  industry: z.string().trim().max(120).optional(),
  niche: z.string().trim().max(300).optional(),
  description: z.string().trim().max(2000).optional(),
  targetAudience: z.string().trim().max(1000).optional(),
  voice: z.string().trim().max(500).optional(),
  competitors: z.array(z.string().trim().max(200)).max(10).default([]),
  goals: z.array(z.string().trim().max(200)).max(10).default([]),
  keywords: z.array(z.string().trim().max(60)).max(30).default([]),
  avoidTopics: z.array(z.string().trim().max(120)).max(20).default([]),
  aiOptIn: z.boolean().default(false),
  /** Each week the AI drafts a content plan into the approval queue. Requires aiOptIn. */
  autopilotEnabled: z.boolean().default(false),
});
export type BrandProfileInput = z.infer<typeof brandProfileSchema>;
