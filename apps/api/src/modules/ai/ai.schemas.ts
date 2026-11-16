import { PLATFORMS } from '@automarket/shared';
import { z } from 'zod';

export const captionOutput = z.object({
  variants: z
    .array(
      z.object({
        hook: z.string(),
        caption: z.string(),
        hashtags: z.array(z.string()),
        cta: z.string(),
      }),
    )
    .min(1)
    .max(5),
});

export const hashtagsOutput = z.object({
  groups: z.array(z.object({ label: z.string(), hashtags: z.array(z.string()) })),
});

export const repurposeOutput = z.object({
  posts: z.array(
    z.object({ platform: z.enum(PLATFORMS), caption: z.string(), notes: z.string().optional() }),
  ),
});

export const emailOutput = z.object({
  subjectLines: z.array(z.string()).min(1),
  previewText: z.string(),
  html: z.string(),
  plainText: z.string(),
});

export const contentPlanOutput = z.object({
  ideas: z
    .array(
      z.object({
        dayOffset: z.number().int().min(0).max(30),
        platforms: z.array(z.enum(PLATFORMS)),
        format: z.string(),
        hook: z.string(),
        caption: z.string(),
        visualPrompt: z.string(),
        rationale: z.string(),
      }),
    )
    .min(1)
    .max(21),
});

export const nicheReportOutput = z.object({
  summary: z.string(),
  audience: z.object({
    personas: z.array(
      z.object({ name: z.string(), description: z.string(), painPoints: z.array(z.string()) }),
    ),
  }),
  trends: z.array(
    z.object({
      title: z.string(),
      description: z.string(),
      relevance: z.enum(['high', 'medium', 'low']),
    }),
  ),
  contentPillars: z.array(
    z.object({ name: z.string(), description: z.string(), exampleIdeas: z.array(z.string()) }),
  ),
  competitorAngles: z.array(
    z.object({ competitor: z.string(), whatWorks: z.string(), gapToExploit: z.string() }),
  ),
  platformStrategy: z.array(
    z.object({
      platform: z.enum(PLATFORMS),
      focus: z.string(),
      cadencePerWeek: z.number(),
      bestTimes: z.array(z.string()),
    }),
  ),
  hashtags: z.array(z.string()),
  opportunities: z.array(z.string()),
  sources: z.array(z.string()).default([]),
});
export type NicheReport = z.infer<typeof nicheReportOutput>;

export const performanceInsightsOutput = z.object({
  headline: z.string(),
  whatsWorking: z.array(z.string()),
  whatsNot: z.array(z.string()),
  recommendations: z.array(
    z.object({ title: z.string(), detail: z.string(), impact: z.enum(['high', 'medium', 'low']) }),
  ),
  nextWeekIdeas: z.array(z.string()),
});
