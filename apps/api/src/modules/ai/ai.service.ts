import { randomUUID } from 'node:crypto';
import {
  creditsFor,
  PLATFORM_SPECS,
  videoCredits,
  type AiAction,
  type GenerateImageInput,
  type GenerateTextInput,
  type GenerateVideoInput,
} from '@automarket/shared';
import type { z } from 'zod';
import { env } from '../../config/env.js';
import { prisma, type AiGenerationType } from '../../core/db/prisma.js';
import { BadRequestError, NotFoundError } from '../../core/errors.js';
import { logger } from '../../core/logger.js';
import { enqueue } from '../../core/queue/queue.js';
import type { AuthUser, WorkspaceContext } from '../../core/http/types.js';
import {
  higgsfieldClient,
  isTerminal,
  type HiggsfieldResult,
} from '../../integrations/higgsfield/higgsfield.client.js';
import { openaiClient } from '../../integrations/openai/openai.client.js';
import { putFromUrl, storage } from '../../integrations/storage/storage.js';
import { creditService } from '../credits/credit.service.js';
import { mediaKey, presentMedia } from '../media/media.service.js';
import { usageService } from '../usage/usage.service.js';
import {
  captionOutput,
  contentPlanOutput,
  emailOutput,
  hashtagsOutput,
  repurposeOutput,
} from './ai.schemas.js';
import { buildBrandContext, loadBrandForAi, SYSTEM_PROMPT } from './brand-context.js';

const TEXT_KINDS = {
  caption: {
    action: 'text.caption',
    schema: captionOutput,
    task: 'Write 3 distinct post variants (different hooks/angles).',
  },
  hashtags: {
    action: 'text.hashtags',
    schema: hashtagsOutput,
    task: 'Suggest grouped hashtag sets: broad reach, niche, and branded/community.',
  },
  repurpose: {
    action: 'text.repurpose',
    schema: repurposeOutput,
    task: 'Rewrite this content natively for each listed platform.',
  },
  email: {
    action: 'text.email',
    schema: emailOutput,
    task: 'Write a marketing email: 3 subject line options, preview text, and simple responsive HTML (inline styles, single column, one CTA button). Use {{firstName}} for personalization. Do not include an unsubscribe link (it is added automatically).',
  },
  contentPlan: {
    action: 'text.contentPlan',
    schema: contentPlanOutput,
    task: 'Create a 7-day content plan (5-10 posts) mixing content pillars and formats. For each, give a hook, a ready-to-post caption, and a prompt for the visual.',
  },
} as const satisfies Record<
  GenerateTextInput['kind'],
  { action: AiAction; schema: z.ZodType; task: string }
>;

const OPENAI_SIZES: Record<GenerateImageInput['aspectRatio'], string> = {
  '1:1': '1024x1024',
  '4:5': '1024x1536',
  '3:4': '1024x1536',
  '9:16': '1024x1536',
  '16:9': '1536x1024',
  '4:3': '1536x1024',
};
const HIGGSFIELD_RATIOS: Record<GenerateImageInput['aspectRatio'], string> = {
  '1:1': '1:1',
  '4:5': '3:4',
  '3:4': '3:4',
  '9:16': '9:16',
  '16:9': '16:9',
  '4:3': '4:3',
};

export const presentGeneration = async (
  g: Awaited<ReturnType<typeof prisma.aiGeneration.findUniqueOrThrow>>,
) => {
  const mediaIds = ((g.output as { mediaIds?: string[] } | null)?.mediaIds ?? []) as string[];
  const media = mediaIds.length
    ? await prisma.mediaAsset.findMany({ where: { id: { in: mediaIds } } })
    : [];
  return {
    id: g.id,
    type: g.type,
    action: g.action,
    provider: g.provider,
    status: g.status,
    prompt: g.prompt,
    output: g.output,
    creditsCharged: g.creditsCharged,
    error: g.error,
    createdAt: g.createdAt,
    completedAt: g.completedAt,
    media: await Promise.all(media.map(presentMedia)),
  };
};

export class AiService {
  private record(
    ws: WorkspaceContext,
    user: AuthUser,
    data: {
      brandId: string;
      type: AiGenerationType;
      action: string;
      provider: string;
      prompt: string;
      input: object;
      reservationId?: string;
    },
  ) {
    return prisma.aiGeneration.create({
      data: { workspaceId: ws.id, userId: user.id, status: 'RUNNING', ...data },
    });
  }

  async generateText(ws: WorkspaceContext, user: AuthUser, input: GenerateTextInput) {
    usageService.requireFeature(ws, 'aiText', 'AI writing');
    const brand = await loadBrandForAi(ws.id, input.brandId);
    const kind = TEXT_KINDS[input.kind];
    const credits = creditsFor(kind.action);
    const context = await buildBrandContext(brand);
    const platformNotes = input.platforms
      .map(
        (p) =>
          `${PLATFORM_SPECS[p].label}: max ${PLATFORM_SPECS[p].captionMaxLength} chars${PLATFORM_SPECS[p].maxHashtags ? `, up to ${PLATFORM_SPECS[p].maxHashtags} hashtags` : ''}`,
      )
      .join('; ');

    return creditService.withReservation(
      ws.id,
      ws.planId,
      kind.action,
      credits,
      async (reservationId) => {
        const generation = await this.record(ws, user, {
          brandId: brand.id,
          type: 'TEXT',
          action: kind.action,
          provider: 'openai',
          prompt: input.prompt,
          input,
          reservationId,
        });
        try {
          const result = await openaiClient.json({
            schema: kind.schema,
            name: input.kind,
            instructions: SYSTEM_PROMPT,
            input: [
              `BRAND CONTEXT\n${context}`,
              platformNotes && `PLATFORMS\n${platformNotes}`,
              input.tone && `TONE\n${input.tone}`,
              `TASK\n${kind.task}`,
              `BRIEF\n${input.prompt}`,
            ]
              .filter(Boolean)
              .join('\n\n'),
          });
          const done = await prisma.aiGeneration.update({
            where: { id: generation.id },
            data: {
              status: 'SUCCEEDED',
              output: result.data as object,
              model: result.model,
              creditsCharged: credits,
              completedAt: new Date(),
            },
          });
          return presentGeneration(done);
        } catch (err) {
          await prisma.aiGeneration.update({
            where: { id: generation.id },
            data: {
              status: 'FAILED',
              error: err instanceof Error ? err.message : 'failed',
              completedAt: new Date(),
            },
          });
          throw err;
        }
      },
    );
  }

  async generateImage(ws: WorkspaceContext, user: AuthUser, input: GenerateImageInput) {
    usageService.requireFeature(ws, 'aiImage', 'AI images');
    const brand = await loadBrandForAi(ws.id, input.brandId);
    const action = `image.${input.provider}.${input.quality}` as AiAction;
    const credits = creditsFor(action);
    const styled = `${input.prompt}\n\nBrand: ${brand.name}${brand.voice ? `. Visual mood should match a brand voice that is: ${brand.voice}` : ''}. No text overlays unless requested. No logos of other companies.`;

    if (input.provider === 'openai') {
      return creditService.withReservation(
        ws.id,
        ws.planId,
        action,
        credits,
        async (reservationId) => {
          const generation = await this.record(ws, user, {
            brandId: brand.id,
            type: 'IMAGE',
            action,
            provider: 'openai',
            prompt: input.prompt,
            input,
            reservationId,
          });
          try {
            const image = await openaiClient.image({
              prompt: styled,
              size: OPENAI_SIZES[input.aspectRatio],
              quality: input.quality === 'hd' ? 'high' : 'medium',
            });
            const key = mediaKey(ws.id, 'image/png');
            await storage.put(key, image.data, 'image/png');
            const asset = await prisma.mediaAsset.create({
              data: {
                workspaceId: ws.id,
                brandId: brand.id,
                kind: 'IMAGE',
                source: 'AI',
                storageKey: key,
                url: key,
                mimeType: 'image/png',
                sizeBytes: image.data.length,
                aiGenerationId: generation.id,
              },
            });
            const done = await prisma.aiGeneration.update({
              where: { id: generation.id },
              data: {
                status: 'SUCCEEDED',
                model: image.model,
                output: { mediaIds: [asset.id] },
                creditsCharged: credits,
                completedAt: new Date(),
              },
            });
            return presentGeneration(done);
          } catch (err) {
            await prisma.aiGeneration.update({
              where: { id: generation.id },
              data: {
                status: 'FAILED',
                error: err instanceof Error ? err.message : 'failed',
                completedAt: new Date(),
              },
            });
            throw err;
          }
        },
      );
    }

    return this.submitHiggsfield(ws, user, {
      brandId: brand.id,
      type: 'IMAGE',
      action,
      credits,
      prompt: input.prompt,
      input,
      endpoint: env.HIGGSFIELD_IMAGE_ENDPOINT,
      body: {
        prompt: styled,
        aspect_ratio: HIGGSFIELD_RATIOS[input.aspectRatio],
        resolution: input.quality === 'hd' ? '1080p' : '720p',
        enhance_prompt: true,
        batch_size: 1,
      },
    });
  }

  async generateVideo(ws: WorkspaceContext, user: AuthUser, input: GenerateVideoInput) {
    usageService.requireFeature(ws, 'aiVideo', 'AI video');
    const brand = await loadBrandForAi(ws.id, input.brandId);
    const credits = videoCredits(input.durationSeconds, input.resolution);
    let imageUrl: string | undefined;
    if (input.imageMediaId) {
      const image = await prisma.mediaAsset.findFirst({
        where: { id: input.imageMediaId, workspaceId: ws.id, kind: 'IMAGE' },
      });
      if (!image) throw new NotFoundError('Source image');
      imageUrl = await storage.readUrl(image.storageKey, 6 * 60 * 60);
    }
    return this.submitHiggsfield(ws, user, {
      brandId: brand.id,
      type: 'VIDEO',
      action: `video.higgsfield.${input.durationSeconds}s`,
      credits,
      prompt: input.prompt,
      input,
      endpoint: imageUrl
        ? env.HIGGSFIELD_IMAGE_TO_VIDEO_ENDPOINT
        : env.HIGGSFIELD_TEXT_TO_VIDEO_ENDPOINT,
      body: {
        prompt: input.prompt,
        duration: input.durationSeconds,
        resolution: input.resolution,
        ...(imageUrl ? { image_url: imageUrl } : {}),
      },
    });
  }

  /** Async provider flow: reserve → submit → (webhook | poll) → capture or release. */
  private async submitHiggsfield(
    ws: WorkspaceContext,
    user: AuthUser,
    opts: {
      brandId: string;
      type: AiGenerationType;
      action: string;
      credits: number;
      prompt: string;
      input: object;
      endpoint: string;
      body: Record<string, unknown>;
    },
  ) {
    const reservationId = await creditService.reserve(ws.id, ws.planId, opts.action, opts.credits);
    const generation = await this.record(ws, user, {
      brandId: opts.brandId,
      type: opts.type,
      action: opts.action,
      provider: 'higgsfield',
      prompt: opts.prompt,
      input: opts.input,
      reservationId,
    });
    try {
      const { requestId } = await higgsfieldClient.submit(opts.endpoint, opts.body, randomUUID());
      const updated = await prisma.aiGeneration.update({
        where: { id: generation.id },
        data: { providerRequestId: requestId, model: opts.endpoint, creditsCharged: opts.credits },
      });
      // Polling fallback in case the webhook never arrives.
      await enqueue('ai.poll', { generationId: generation.id }, { startAfter: 20 });
      return presentGeneration(updated);
    } catch (err) {
      await creditService.release(reservationId);
      await prisma.aiGeneration.update({
        where: { id: generation.id },
        data: {
          status: 'FAILED',
          error: err instanceof Error ? err.message : 'failed',
          completedAt: new Date(),
        },
      });
      throw err;
    }
  }

  /** Called by the Higgsfield webhook and the poll job. Idempotent. */
  async completeHiggsfield(
    requestId: string,
    result: Pick<HiggsfieldResult, 'status' | 'error' | 'images' | 'video'>,
  ) {
    const g = await prisma.aiGeneration.findUnique({ where: { providerRequestId: requestId } });
    if (!g || g.status !== 'RUNNING' || !isTerminal(result.status)) return g;

    if (result.status !== 'completed') {
      if (g.reservationId)
        await creditService.release(
          g.reservationId,
          `Generation ${result.status} — credits returned`,
        );
      return prisma.aiGeneration.update({
        where: { id: g.id },
        data: {
          status: result.status === 'canceled' ? 'CANCELED' : 'FAILED',
          error:
            result.status === 'nsfw'
              ? 'Blocked by content moderation — try a different prompt'
              : (result.error ?? 'Generation failed'),
          creditsCharged: 0,
          completedAt: new Date(),
        },
      });
    }

    try {
      const urls =
        g.type === 'VIDEO'
          ? [result.video?.url].filter(Boolean)
          : (result.images ?? []).map((i) => i.url);
      if (!urls.length) throw new Error('Provider returned no media');
      const mediaIds: string[] = [];
      for (const url of urls as string[]) {
        const mime = g.type === 'VIDEO' ? 'video/mp4' : 'image/png';
        const key = mediaKey(g.workspaceId, mime);
        const { contentType, size } = await putFromUrl(key, url); // provider files expire after 7 days
        const asset = await prisma.mediaAsset.create({
          data: {
            workspaceId: g.workspaceId,
            brandId: g.brandId,
            kind: g.type === 'VIDEO' ? 'VIDEO' : 'IMAGE',
            source: 'AI',
            storageKey: key,
            url: key,
            mimeType: contentType.startsWith(g.type === 'VIDEO' ? 'video' : 'image')
              ? contentType
              : mime,
            sizeBytes: size,
            aiGenerationId: g.id,
          },
        });
        mediaIds.push(asset.id);
      }
      if (g.reservationId) await creditService.capture(g.reservationId);
      return prisma.aiGeneration.update({
        where: { id: g.id },
        data: { status: 'SUCCEEDED', output: { mediaIds }, completedAt: new Date() },
      });
    } catch (err) {
      logger.error({ err, generationId: g.id }, 'failed to store AI output');
      if (g.reservationId) await creditService.release(g.reservationId);
      return prisma.aiGeneration.update({
        where: { id: g.id },
        data: {
          status: 'FAILED',
          error: 'Could not save the generated media',
          creditsCharged: 0,
          completedAt: new Date(),
        },
      });
    }
  }

  /** Poll job: returns true when the generation reached a terminal state. */
  async poll(generationId: string) {
    const g = await prisma.aiGeneration.findUnique({ where: { id: generationId } });
    if (!g || g.status !== 'RUNNING' || !g.providerRequestId) return true;
    const status = await higgsfieldClient.status(g.providerRequestId);
    if (!isTerminal(status.status)) return false;
    await this.completeHiggsfield(g.providerRequestId, status);
    return true;
  }

  async cancel(ws: WorkspaceContext, id: string) {
    const g = await prisma.aiGeneration.findFirst({ where: { id, workspaceId: ws.id } });
    if (!g) throw new NotFoundError('Generation');
    if (g.status !== 'RUNNING' || !g.providerRequestId)
      throw new BadRequestError('Only running generations can be cancelled');
    await higgsfieldClient.cancel(g.providerRequestId); // 400 if already processing
    await this.completeHiggsfield(g.providerRequestId, { status: 'canceled' });
    return presentGeneration(await prisma.aiGeneration.findUniqueOrThrow({ where: { id } }));
  }

  async list(
    ws: WorkspaceContext,
    q: { page: number; pageSize: number; type?: AiGenerationType; brandId?: string },
  ) {
    const where = {
      workspaceId: ws.id,
      ...(q.type ? { type: q.type } : {}),
      ...(q.brandId ? { brandId: q.brandId } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.aiGeneration.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      prisma.aiGeneration.count({ where }),
    ]);
    return {
      items: await Promise.all(items.map(presentGeneration)),
      page: q.page,
      pageSize: q.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / q.pageSize)),
    };
  }

  async get(ws: WorkspaceContext, id: string) {
    const g = await prisma.aiGeneration.findFirst({ where: { id, workspaceId: ws.id } });
    if (!g) throw new NotFoundError('Generation');
    return presentGeneration(g);
  }

  /**
   * Autopilot: turn a content plan into draft posts awaiting approval, one per
   * idea, targeting the brand's connected accounts on the suggested platforms.
   */
  async planToDrafts(ws: WorkspaceContext, user: AuthUser, generationId: string) {
    const g = await prisma.aiGeneration.findFirst({
      where: {
        id: generationId,
        workspaceId: ws.id,
        action: 'text.contentPlan',
        status: 'SUCCEEDED',
      },
    });
    if (!g || !g.brandId) throw new NotFoundError('Content plan');
    const plan = contentPlanOutput.parse(g.output);
    const accounts = await prisma.socialAccount.findMany({
      where: {
        workspaceId: ws.id,
        status: 'CONNECTED',
        OR: [{ brandId: g.brandId }, { brandId: null }],
      },
    });
    let created = 0;
    for (const idea of plan.ideas) {
      const targets = accounts.filter((a) => idea.platforms.includes(a.platform));
      if (!targets.length) continue;
      const day = new Date(Date.now() + (idea.dayOffset + 1) * 86400_000);
      day.setUTCHours(15, 0, 0, 0);
      await prisma.post.create({
        data: {
          workspaceId: ws.id,
          brandId: g.brandId,
          createdById: user.id,
          caption: idea.caption,
          status: 'PENDING_APPROVAL',
          scheduledAt: day,
          aiGenerationId: g.id,
          campaignTag: 'ai-plan',
          targets: {
            create: targets.map((a) => ({
              socialAccountId: a.id,
              options: { visualPrompt: idea.visualPrompt, format: idea.format },
            })),
          },
        },
      });
      created++;
    }
    return { created };
  }
}

export const aiService = new AiService();
