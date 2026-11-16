import { z } from 'zod';
import { PLATFORMS } from '../platforms.js';

export const POST_STATUSES = [
  'DRAFT',
  'PENDING_APPROVAL',
  'SCHEDULED',
  'PUBLISHING',
  'PUBLISHED',
  'PARTIALLY_PUBLISHED',
  'FAILED',
] as const;
export type PostStatus = (typeof POST_STATUSES)[number];

export const postTargetSchema = z.object({
  socialAccountId: z.string().min(1),
  /** Optional per-platform caption override. */
  caption: z.string().max(63206).optional(),
  options: z.record(z.string(), z.unknown()).optional(),
});

export const upsertPostSchema = z
  .object({
    brandId: z.string().min(1),
    caption: z.string().max(63206).default(''),
    mediaIds: z.array(z.string()).max(10).default([]),
    targets: z.array(postTargetSchema).min(1, 'Choose at least one channel'),
    scheduledAt: z.coerce.date().optional().nullable(),
    publishNow: z.boolean().default(false),
    saveAsDraft: z.boolean().default(false),
    /** Autopilot: drop into the next free posting slot. */
    addToQueue: z.boolean().default(false),
    campaignTag: z.string().max(60).optional(),
    aiGenerationId: z.string().optional(),
  })
  .refine((v) => v.saveAsDraft || v.publishNow || v.addToQueue || v.scheduledAt, {
    message: 'Pick a time, add to the queue, publish now, or save as draft',
    path: ['scheduledAt'],
  });
export type UpsertPostInput = z.infer<typeof upsertPostSchema>;

export const listPostsQuerySchema = z.object({
  brandId: z.string().optional(),
  status: z.enum(POST_STATUSES).optional(),
  platform: z.enum(PLATFORMS).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

/** Recurring autopilot slot: "post to these accounts every Tue/Thu at 10:00". */
export const postingScheduleSchema = z.object({
  brandId: z.string().min(1),
  socialAccountIds: z.array(z.string()).min(1),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).min(1),
  timeOfDay: z.string().regex(/^\d{2}:\d{2}$/),
  timezone: z.string().max(64),
});
