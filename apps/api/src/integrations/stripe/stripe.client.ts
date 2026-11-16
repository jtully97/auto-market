import Stripe from 'stripe';
import { env } from '../../config/env.js';
import { BadRequestError } from '../../core/errors.js';

let client: Stripe | null = null;
export const getStripe = (): Stripe => {
  if (!env.STRIPE_SECRET_KEY)
    throw new BadRequestError('Billing is not configured (STRIPE_SECRET_KEY)');
  client ??= new Stripe(env.STRIPE_SECRET_KEY);
  return client;
};
