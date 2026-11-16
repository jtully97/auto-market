/**
 * Creates/updates Stripe Products + Prices from the plan catalog in @automarket/shared.
 * Idempotent: prices are matched by lookup_key; changed amounts create a new Price
 * and move the lookup key to it (existing subscribers keep their old price).
 *
 *   pnpm --filter @automarket/api stripe:sync
 */
import { CREDIT_PACKS, PLANS } from '@automarket/shared';
import { getStripe } from '../integrations/stripe/stripe.client.js';

const stripe = getStripe();

const upsertProduct = async (key: string, name: string, description: string) => {
  const found = await stripe.products.search({ query: `metadata['automarket_key']:'${key}'` });
  if (found.data[0]) return stripe.products.update(found.data[0].id, { name, description });
  return stripe.products.create({ name, description, metadata: { automarket_key: key } });
};

const upsertPrice = async (
  product: string,
  lookupKey: string,
  unitAmount: number,
  interval?: 'month' | 'year',
) => {
  const existing = (await stripe.prices.list({ lookup_keys: [lookupKey], limit: 1 })).data[0];
  if (existing && existing.unit_amount === unitAmount && existing.active) {
    console.log(`  = ${lookupKey} (${unitAmount / 100} USD)`);
    return;
  }
  await stripe.prices.create({
    product,
    currency: 'usd',
    unit_amount: unitAmount,
    lookup_key: lookupKey,
    transfer_lookup_key: true,
    ...(interval ? { recurring: { interval } } : {}),
  });
  console.log(`  + ${lookupKey} (${unitAmount / 100} USD)`);
};

for (const plan of Object.values(PLANS)) {
  if (!plan.stripeLookupKeys) continue;
  console.log(`Plan: ${plan.name}`);
  const product = await upsertProduct(
    `plan_${plan.id}`,
    `AutoMarket ${plan.name}`,
    `${plan.tagline}. Includes ${plan.monthlyCredits.toLocaleString()} AI credits / month.`,
  );
  await upsertPrice(product.id, plan.stripeLookupKeys.month, plan.priceMonthly, 'month');
  await upsertPrice(product.id, plan.stripeLookupKeys.year, plan.priceYearly, 'year');
}
for (const pack of CREDIT_PACKS) {
  console.log(`Pack: ${pack.name}`);
  const product = await upsertProduct(
    pack.id,
    `AutoMarket ${pack.name}`,
    'AI credits — valid for 12 months.',
  );
  await upsertPrice(product.id, pack.stripeLookupKey, pack.price);
}
console.log('Stripe catalog in sync.');
