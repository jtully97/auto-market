import { z } from 'zod';
import { PLATFORMS } from '../platforms.js';

export const generateTextSchema = z.object({
  brandId: z.string().min(1),
  kind: z.enum(['caption', 'hashtags', 'repurpose', 'email', 'contentPlan']),
  prompt: z.string().trim().min(1).max(4000),
  platforms: z.array(z.enum(PLATFORMS)).default([]),
  tone: z.string().max(100).optional(),
});
export type GenerateTextInput = z.infer<typeof generateTextSchema>;

export const generateImageSchema = z.object({
  brandId: z.string().min(1),
  provider: z.enum(['openai', 'higgsfield']).default('openai'),
  prompt: z.string().trim().min(1).max(4000),
  quality: z.enum(['standard', 'hd']).default('standard'),
  aspectRatio: z.enum(['1:1', '4:5', '9:16', '16:9', '3:4', '4:3']).default('1:1'),
});
export type GenerateImageInput = z.infer<typeof generateImageSchema>;

export const generateVideoSchema = z.object({
  brandId: z.string().min(1),
  prompt: z.string().trim().min(1).max(2000),
  imageMediaId: z.string().optional(),
  durationSeconds: z.union([z.literal(5), z.literal(10), z.literal(15)]).default(5),
  resolution: z.enum(['480p', '720p', '1080p']).default('720p'),
});
export type GenerateVideoInput = z.infer<typeof generateVideoSchema>;

export const analystRequestSchema = z.object({
  brandId: z.string().min(1),
  kind: z.enum(['nicheReport', 'performanceInsights']),
  question: z.string().trim().max(2000).optional(),
});
export type AnalystRequestInput = z.infer<typeof analystRequestSchema>;

export const AI_GENERATION_STATUSES = [
  'PENDING',
  'RUNNING',
  'SUCCEEDED',
  'FAILED',
  'CANCELED',
] as const;
