import { z } from 'zod';

export const contactSchema = z.object({
  email: z.email().toLowerCase(),
  firstName: z.string().trim().max(100).optional(),
  lastName: z.string().trim().max(100).optional(),
  phone: z.string().trim().max(40).optional(),
  tags: z.array(z.string().trim().max(50)).max(50).default([]),
  attributes: z.record(z.string(), z.string()).default({}),
  listIds: z.array(z.string()).default([]),
});
export type ContactInput = z.infer<typeof contactSchema>;

export const contactImportSchema = z.object({
  /** Maps CSV header -> contact field ("email", "firstName", "lastName", "phone", "tags", or "attr:<name>"). */
  mapping: z.record(z.string(), z.string()),
  listId: z.string().optional(),
  tags: z.array(z.string()).default([]),
  /** Caller attests contacts opted in — required for compliance (CAN-SPAM / GDPR). */
  consentConfirmed: z.literal(true, { message: 'Confirm these contacts agreed to receive email' }),
});

export const contactListSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).optional(),
});

export const CAMPAIGN_STATUSES = [
  'DRAFT',
  'SCHEDULED',
  'SENDING',
  'SENT',
  'CANCELED',
  'FAILED',
] as const;

export const emailCampaignSchema = z.object({
  brandId: z.string().min(1),
  name: z.string().trim().min(1).max(150),
  subject: z.string().trim().min(1).max(200),
  previewText: z.string().trim().max(200).optional(),
  fromName: z.string().trim().min(1).max(100),
  replyTo: z.email().optional(),
  /** Editor document (block JSON) and the rendered HTML. */
  design: z.unknown().optional(),
  html: z.string().min(1).max(500_000),
  listIds: z.array(z.string()).min(1, 'Pick at least one list'),
  scheduledAt: z.coerce.date().optional().nullable(),
});
export type EmailCampaignInput = z.infer<typeof emailCampaignSchema>;

export const sendTestEmailSchema = z.object({ to: z.array(z.email()).min(1).max(5) });
