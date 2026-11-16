import { env } from '../../config/env.js';
import { prisma } from '../../core/db/prisma.js';
import { logger } from '../../core/logger.js';
import { sendTransactional } from '../../integrations/email/mailer.js';
import { systemContextFor } from '../workspaces/workspace-context.js';
import { aiService } from './ai.service.js';

const WEEK_MS = 7 * 86400_000;

/**
 * Hands-off mode. Once a week, for every brand with autopilot on, the AI drafts
 * next week's content plan (charged in credits like any generation) and drops it
 * into the approval queue, then emails the owner to review. Nothing is posted
 * without a human approving it.
 */
export const autopilotService = {
  async run() {
    const due = await prisma.brand.findMany({
      where: {
        aiOptIn: true,
        autopilotEnabled: true,
        OR: [
          { autopilotLastRunAt: null },
          { autopilotLastRunAt: { lt: new Date(Date.now() - WEEK_MS) } },
        ],
        socialAccounts: { some: { status: 'CONNECTED' } },
      },
      take: 50,
    });
    for (const brand of due) {
      await prisma.brand.update({
        where: { id: brand.id },
        data: { autopilotLastRunAt: new Date() },
      });
      try {
        const { ws, owner } = await systemContextFor(brand.workspaceId);
        const accounts = await prisma.socialAccount.findMany({
          where: {
            workspaceId: ws.id,
            status: 'CONNECTED',
            OR: [{ brandId: brand.id }, { brandId: null }],
          },
          select: { platform: true },
        });
        const plan = await aiService.generateText(ws, owner, {
          brandId: brand.id,
          kind: 'contentPlan',
          prompt:
            'Plan next week of content for our connected channels, building on what performs best.',
          platforms: [...new Set(accounts.map((a) => a.platform))],
        });
        const { created } = await aiService.planToDrafts(ws, owner, plan.id);
        await sendTransactional(
          owner.email,
          `${created} posts are ready for your review`,
          `<p>Hi ${owner.name},</p><p>Autopilot drafted <b>${created}</b> posts for <b>${brand.name}</b> next week.</p><p><a href="${env.WEB_URL}/content?status=PENDING_APPROVAL">Review and approve</a></p>`,
        );
      } catch (err) {
        logger.warn({ err, brandId: brand.id }, 'autopilot run failed');
      }
    }
  },
};
