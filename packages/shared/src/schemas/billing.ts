import { z } from 'zod';
import { PLAN_IDS } from '../plans.js';

export const checkoutSchema = z.object({
  planId: z.enum(PLAN_IDS).exclude(['free']),
  interval: z.enum(['month', 'year']).default('month'),
});
export const creditPackCheckoutSchema = z.object({ packId: z.string().min(1) });
