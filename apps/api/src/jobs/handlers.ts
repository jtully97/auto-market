import type { JobHandlers } from '../core/queue/queue.js';
import { aiService } from '../modules/ai/ai.service.js';
import { autopilotService } from '../modules/ai/autopilot.service.js';
import { analyticsService } from '../modules/analytics/analytics.service.js';
import { billingService } from '../modules/billing/billing.service.js';
import { campaignService } from '../modules/campaigns/campaign.service.js';
import { contactService } from '../modules/contacts/contact.service.js';
import { creditService } from '../modules/credits/credit.service.js';
import { publishingService } from '../modules/posts/publishing.service.js';
import { socialAccountService } from '../modules/social-accounts/social-account.service.js';

/** Every background job maps to one service method — jobs hold no business logic. */
export const jobHandlers: JobHandlers = {
  'post.publish': ({ postId }) => publishingService.publish(postId),
  'post.metrics.sync': () => analyticsService.syncPostMetrics(),
  'account.metrics.sync': () => analyticsService.syncAccountMetrics(),
  'social.tokens.refresh': () => socialAccountService.refreshExpiring(),
  'campaign.send': ({ campaignId }) => campaignService.startSend(campaignId),
  'campaign.batch': ({ campaignId, sendIds }) => campaignService.sendBatch(campaignId, sendIds),
  'contacts.import': (data) => contactService.processImport(data),
  'ai.poll': async ({ generationId }) => {
    const done = await aiService.poll(generationId);
    // Throwing schedules a retry (retryDelay 10s, up to 60 attempts ≈ 10 min).
    if (!done) throw new Error('generation still running');
  },
  'credits.maintenance': async () => {
    await creditService.maintenance();
    await billingService.grantMonthlyAllowances();
  },
  'autopilot.fill': () => autopilotService.run(),
};
