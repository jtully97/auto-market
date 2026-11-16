import { describe, expect, it } from 'vitest';
import {
  AI_ACTIONS,
  AI_ACTION_PRICING,
  CREDIT_COGS_CEILING_USD,
  creditsFor,
  videoCredits,
} from './credits.js';
import { CREDIT_PACKS, PLANS } from './plans.js';

describe('credit pricing guardrails', () => {
  it('never prices an action below its provider cost ceiling', () => {
    for (const action of AI_ACTIONS) {
      const credits = creditsFor(action);
      expect(credits * CREDIT_COGS_CEILING_USD).toBeGreaterThanOrEqual(
        AI_ACTION_PRICING[action].estimatedCostUsd,
      );
    }
  });

  it('keeps retail credit value at least 2x the cost ceiling for every plan and pack', () => {
    for (const plan of Object.values(PLANS)) {
      if (plan.priceMonthly === 0) continue;
      expect(plan.priceMonthly / 100 / plan.monthlyCredits).toBeGreaterThanOrEqual(
        CREDIT_COGS_CEILING_USD * 2,
      );
    }
    for (const pack of CREDIT_PACKS) {
      expect(pack.price / 100 / pack.credits).toBeGreaterThanOrEqual(CREDIT_COGS_CEILING_USD * 2);
    }
  });

  it('scales video by resolution', () => {
    expect(videoCredits(5, '1080p')).toBeGreaterThan(videoCredits(5, '720p'));
    expect(videoCredits(10, '720p')).toBe(creditsFor('video.higgsfield.10s'));
  });
});
