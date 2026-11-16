import { creditsFor } from '@automarket/shared';
import { env } from '../../config/env.js';
import { prisma } from '../../core/db/prisma.js';
import { BadRequestError } from '../../core/errors.js';
import type { AuthUser, WorkspaceContext } from '../../core/http/types.js';
import { openaiClient } from '../../integrations/openai/openai.client.js';
import { analyticsService } from '../analytics/analytics.service.js';
import { creditService } from '../credits/credit.service.js';
import { usageService } from '../usage/usage.service.js';
import { nicheReportOutput, performanceInsightsOutput } from './ai.schemas.js';
import { buildBrandContext, loadBrandForAi } from './brand-context.js';
import { presentGeneration } from './ai.service.js';

const ANALYST_PROMPT = `You are AutoMarket's AI marketing analyst. You study a brand's market lane:
its niche, audience, competitors and what content is winning right now. Use web search to ground
your findings in current, real information and cite source URLs. Be specific and practical — every
insight should translate into content the brand can post this week. Never invent statistics.`;

/**
 * The AI analyst. Its niche report is stored on the brand and injected into
 * every later generation, so all AI content stays relevant to the lane.
 */
export const analystService = {
  async nicheReport(ws: WorkspaceContext, user: AuthUser, brandId: string, question?: string) {
    usageService.requireFeature(ws, 'aiAnalyst', 'The AI analyst');
    const brand = await loadBrandForAi(ws.id, brandId);
    if (!brand.niche && !brand.industry && !brand.description) {
      throw new BadRequestError(
        'Tell us your industry or niche in Brand settings so the analyst knows what to study',
      );
    }
    const credits = creditsFor('analyst.nicheReport');
    return creditService.withReservation(
      ws.id,
      ws.planId,
      'analyst.nicheReport',
      credits,
      async (reservationId) => {
        const result = await openaiClient.json({
          schema: nicheReportOutput,
          name: 'niche_report',
          model: env.OPENAI_ANALYST_MODEL,
          webSearch: true,
          instructions: ANALYST_PROMPT,
          input: `${await buildBrandContext(brand)}\n\nProduce a niche intelligence report for this brand.${question ? `\nAlso answer: ${question}` : ''}`,
        });
        await prisma.brand.update({
          where: { id: brand.id },
          data: { insights: result.data as object, insightsUpdatedAt: new Date() },
        });
        const g = await prisma.aiGeneration.create({
          data: {
            workspaceId: ws.id,
            brandId: brand.id,
            userId: user.id,
            type: 'ANALYST',
            action: 'analyst.nicheReport',
            provider: 'openai',
            model: result.model,
            prompt: question ?? 'Niche report',
            output: result.data as object,
            status: 'SUCCEEDED',
            reservationId,
            creditsCharged: credits,
            completedAt: new Date(),
          },
        });
        return presentGeneration(g);
      },
    );
  },

  async performanceInsights(
    ws: WorkspaceContext,
    user: AuthUser,
    brandId: string,
    question?: string,
  ) {
    usageService.requireFeature(ws, 'aiAnalyst', 'The AI analyst');
    const brand = await loadBrandForAi(ws.id, brandId);
    const stats = await analyticsService.overview(ws, { brandId, days: 90 });
    if (!stats.totals.posts)
      throw new BadRequestError(
        'Publish a few posts first — the analyst needs performance data to study',
      );
    const credits = creditsFor('analyst.performanceInsights');
    return creditService.withReservation(
      ws.id,
      ws.planId,
      'analyst.performanceInsights',
      credits,
      async (reservationId) => {
        const result = await openaiClient.json({
          schema: performanceInsightsOutput,
          name: 'performance_insights',
          model: env.OPENAI_ANALYST_MODEL,
          instructions: ANALYST_PROMPT,
          input: `${await buildBrandContext(brand)}\n\nLAST 90 DAYS PERFORMANCE (JSON)\n${JSON.stringify(stats)}\n\nExplain what is working, what isn't, and what to do next.${question ? `\nAlso answer: ${question}` : ''}`,
        });
        const g = await prisma.aiGeneration.create({
          data: {
            workspaceId: ws.id,
            brandId: brand.id,
            userId: user.id,
            type: 'ANALYST',
            action: 'analyst.performanceInsights',
            provider: 'openai',
            model: result.model,
            prompt: question ?? 'Performance insights',
            output: result.data as object,
            status: 'SUCCEEDED',
            reservationId,
            creditsCharged: credits,
            completedAt: new Date(),
          },
        });
        return presentGeneration(g);
      },
    );
  },
};
