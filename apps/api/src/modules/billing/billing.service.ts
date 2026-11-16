import type Stripe from 'stripe';
import {
  CREDIT_PACKS,
  PACK_CREDIT_EXPIRY_DAYS,
  PLANS,
  getPlan,
  type BillingInterval,
  type PlanId,
} from '@automarket/shared';
import { env } from '../../config/env.js';
import { prisma, type SubscriptionStatus } from '../../core/db/prisma.js';
import { BadRequestError } from '../../core/errors.js';
import { logger } from '../../core/logger.js';
import type { AuthUser, WorkspaceContext } from '../../core/http/types.js';
import { getStripe } from '../../integrations/stripe/stripe.client.js';
import { endOfMonth } from '../auth/auth.service.js';
import { creditService } from '../credits/credit.service.js';

const STATUS_MAP: Record<string, SubscriptionStatus> = {
  trialing: 'TRIALING',
  active: 'ACTIVE',
  past_due: 'PAST_DUE',
  canceled: 'CANCELED',
  incomplete: 'INCOMPLETE',
  incomplete_expired: 'CANCELED',
  unpaid: 'UNPAID',
  paused: 'PAST_DUE',
};

/** lookup key "business_monthly" -> { planId: 'business', interval: 'month' } */
const planFromLookupKey = (
  key?: string | null,
): { planId: PlanId; interval: BillingInterval } | null => {
  for (const plan of Object.values(PLANS)) {
    if (plan.stripeLookupKeys?.month === key) return { planId: plan.id, interval: 'month' };
    if (plan.stripeLookupKeys?.year === key) return { planId: plan.id, interval: 'year' };
  }
  return null;
};

const priceByLookupKey = async (key: string) => {
  const prices = await getStripe().prices.list({ lookup_keys: [key], active: true, limit: 1 });
  const price = prices.data[0];
  if (!price)
    throw new BadRequestError(
      `Stripe price "${key}" is missing — run \`pnpm --filter @automarket/api stripe:sync\``,
    );
  return price;
};

/** Period bounds moved from Subscription to SubscriptionItem in newer API versions; support both. */
const periodOf = (sub: Stripe.Subscription) => {
  const loose = sub as unknown as { current_period_start?: number; current_period_end?: number };
  const item = sub.items.data[0] as unknown as
    { current_period_start?: number; current_period_end?: number } | undefined;
  const start = loose.current_period_start ?? item?.current_period_start;
  const end = loose.current_period_end ?? item?.current_period_end;
  return { start: start ? new Date(start * 1000) : null, end: end ? new Date(end * 1000) : null };
};

const subscriptionIdOfInvoice = (invoice: Stripe.Invoice): string | null => {
  const loose = invoice as unknown as {
    subscription?: string | { id: string } | null;
    parent?: { subscription_details?: { subscription?: string | { id: string } } };
  };
  const ref = loose.subscription ?? loose.parent?.subscription_details?.subscription;
  return typeof ref === 'string' ? ref : (ref?.id ?? null);
};

export const billingService = {
  async ensureCustomer(ws: WorkspaceContext, user: AuthUser) {
    const workspace = await prisma.workspace.findUniqueOrThrow({ where: { id: ws.id } });
    if (workspace.stripeCustomerId) return workspace.stripeCustomerId;
    const customer = await getStripe().customers.create({
      email: user.email,
      name: workspace.name,
      metadata: { workspaceId: ws.id },
    });
    await prisma.workspace.update({
      where: { id: ws.id },
      data: { stripeCustomerId: customer.id },
    });
    return customer.id;
  },

  /** New subscription → Checkout. Existing subscription → in-place plan change with proration. */
  async checkout(
    ws: WorkspaceContext,
    user: AuthUser,
    planId: Exclude<PlanId, 'free'>,
    interval: BillingInterval,
  ) {
    const plan = PLANS[planId];
    const price = await priceByLookupKey(plan.stripeLookupKeys![interval]);
    const workspace = await prisma.workspace.findUniqueOrThrow({ where: { id: ws.id } });

    if (
      workspace.stripeSubscriptionId &&
      ['ACTIVE', 'TRIALING', 'PAST_DUE'].includes(workspace.subscriptionStatus)
    ) {
      const sub = await getStripe().subscriptions.retrieve(workspace.stripeSubscriptionId);
      const upgrading = plan.monthlyCredits > getPlan(workspace.planId).monthlyCredits;
      await getStripe().subscriptions.update(sub.id, {
        items: [{ id: sub.items.data[0]!.id, price: price.id }],
        // Charge upgrades now so the extra credits are paid for; downgrades apply at renewal credit.
        proration_behavior: upgrading ? 'always_invoice' : 'create_prorations',
        cancel_at_period_end: false,
        metadata: { workspaceId: ws.id },
      });
      return { url: `${env.WEB_URL}/settings/billing?changed=${planId}` };
    }

    const session = await getStripe().checkout.sessions.create({
      mode: 'subscription',
      customer: await this.ensureCustomer(ws, user),
      line_items: [{ price: price.id, quantity: 1 }],
      allow_promotion_codes: true,
      client_reference_id: ws.id,
      subscription_data: { metadata: { workspaceId: ws.id } },
      metadata: { workspaceId: ws.id, planId },
      success_url: `${env.WEB_URL}/settings/billing?success=1`,
      cancel_url: `${env.WEB_URL}/settings/billing?canceled=1`,
    });
    return { url: session.url };
  },

  async creditPackCheckout(ws: WorkspaceContext, user: AuthUser, packId: string) {
    const pack = CREDIT_PACKS.find((p) => p.id === packId);
    if (!pack) throw new BadRequestError('Unknown credit pack');
    const price = await priceByLookupKey(pack.stripeLookupKey);
    const session = await getStripe().checkout.sessions.create({
      mode: 'payment',
      customer: await this.ensureCustomer(ws, user),
      line_items: [{ price: price.id, quantity: 1 }],
      client_reference_id: ws.id,
      metadata: { workspaceId: ws.id, packId: pack.id, credits: String(pack.credits) },
      invoice_creation: { enabled: true },
      success_url: `${env.WEB_URL}/settings/billing?credits=${pack.credits}`,
      cancel_url: `${env.WEB_URL}/settings/billing`,
    });
    return { url: session.url };
  },

  async portal(ws: WorkspaceContext, user: AuthUser) {
    const session = await getStripe().billingPortal.sessions.create({
      customer: await this.ensureCustomer(ws, user),
      return_url: `${env.WEB_URL}/settings/billing`,
    });
    return { url: session.url };
  },

  async invoices(ws: WorkspaceContext) {
    const workspace = await prisma.workspace.findUniqueOrThrow({ where: { id: ws.id } });
    if (!workspace.stripeCustomerId || !env.STRIPE_SECRET_KEY) return [];
    const list = await getStripe().invoices.list({
      customer: workspace.stripeCustomerId,
      limit: 24,
    });
    return list.data.map((i) => ({
      id: i.id,
      number: i.number,
      total: i.total,
      currency: i.currency,
      status: i.status,
      created: new Date(i.created * 1000),
      url: i.hosted_invoice_url,
      pdf: i.invoice_pdf,
    }));
  },

  // ───────────── Webhooks ─────────────

  async handleWebhook(rawBody: Buffer, signature: string | undefined) {
    if (!env.STRIPE_WEBHOOK_SECRET)
      throw new BadRequestError('Stripe webhook secret not configured');
    const event = getStripe().webhooks.constructEvent(
      rawBody,
      signature ?? '',
      env.STRIPE_WEBHOOK_SECRET,
    );

    // Idempotency: Stripe retries and may deliver duplicates.
    const seen = await prisma.stripeEvent.findUnique({ where: { id: event.id } });
    if (seen) return { duplicate: true };

    switch (event.type) {
      case 'checkout.session.completed':
        await this.onCheckoutCompleted(event.data.object);
        break;
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await this.syncSubscription(event.data.object, event.id);
        break;
      case 'invoice.paid':
        await this.onInvoicePaid(event.data.object);
        break;
      default:
        break;
    }
    await prisma.stripeEvent.create({ data: { id: event.id, type: event.type } });
    return { received: true };
  },

  async onCheckoutCompleted(session: Stripe.Checkout.Session) {
    const workspaceId = session.metadata?.workspaceId ?? session.client_reference_id;
    if (!workspaceId) return;
    if (
      session.mode === 'payment' &&
      session.metadata?.packId &&
      session.payment_status === 'paid'
    ) {
      const credits = Number(session.metadata.credits);
      await creditService.grant(workspaceId, {
        source: 'PACK',
        amount: credits,
        expiresAt: new Date(Date.now() + PACK_CREDIT_EXPIRY_DAYS * 86400_000),
        externalRef: `checkout:${session.id}`,
        description: `Purchased ${credits.toLocaleString()} credits`,
      });
    }
    if (session.mode === 'subscription' && typeof session.subscription === 'string') {
      const sub = await getStripe().subscriptions.retrieve(session.subscription);
      await this.syncSubscription(sub, `checkout:${session.id}`);
    }
  },

  async syncSubscription(sub: Stripe.Subscription, eventId: string) {
    const workspace =
      (sub.metadata?.workspaceId &&
        (await prisma.workspace.findUnique({ where: { id: sub.metadata.workspaceId } }))) ||
      (await prisma.workspace.findFirst({
        where: {
          stripeCustomerId: typeof sub.customer === 'string' ? sub.customer : sub.customer.id,
        },
      }));
    if (!workspace) {
      logger.warn({ subscription: sub.id }, 'subscription for unknown workspace');
      return;
    }
    const status = STATUS_MAP[sub.status] ?? 'NONE';
    const ended = sub.status === 'canceled' || sub.status === 'incomplete_expired';
    const parsed = planFromLookupKey(sub.items.data[0]?.price.lookup_key);
    const planId = ended ? 'free' : (parsed?.planId ?? workspace.planId);
    const period = periodOf(sub);

    // Mid-cycle upgrade: top up the difference in monthly credits right away.
    const previous = getPlan(workspace.planId);
    const next = getPlan(planId);
    if (
      !ended &&
      next.monthlyCredits > previous.monthlyCredits &&
      workspace.planId !== 'free' &&
      period.end
    ) {
      await creditService.grant(workspace.id, {
        source: 'SUBSCRIPTION',
        amount: next.monthlyCredits - previous.monthlyCredits,
        expiresAt: period.end,
        externalRef: `upgrade:${sub.id}:${eventId}`,
        description: `Upgrade to ${next.name}: extra credits for this period`,
      });
    }

    await prisma.workspace.update({
      where: { id: workspace.id },
      data: {
        planId,
        subscriptionStatus: ended ? 'CANCELED' : status,
        stripeSubscriptionId: ended ? null : sub.id,
        billingInterval: parsed?.interval ?? workspace.billingInterval,
        currentPeriodStart: period.start,
        currentPeriodEnd: period.end,
        cancelAtPeriodEnd: sub.cancel_at_period_end,
      },
    });
  },

  /** Each paid subscription invoice starts a new credit period. */
  async onInvoicePaid(invoice: Stripe.Invoice) {
    const subId = subscriptionIdOfInvoice(invoice);
    if (!subId) return;
    const reason = (invoice as unknown as { billing_reason?: string }).billing_reason;
    if (reason !== 'subscription_create' && reason !== 'subscription_cycle') return;
    const sub = await getStripe().subscriptions.retrieve(subId);
    await this.syncSubscription(sub, `invoice:${invoice.id}`);
    const workspace = await prisma.workspace.findFirst({ where: { stripeSubscriptionId: sub.id } });
    const period = periodOf(sub);
    if (!workspace || !period.end) return;
    // Yearly plans still receive credits monthly, so annual buyers can't front-load AI spend.
    const yearly = workspace.billingInterval === 'year';
    const ref = yearly
      ? `yearly:${workspace.id}:${new Date().toISOString().slice(0, 7)}`
      : `invoice:${invoice.id}`;
    await creditService.resetSubscriptionAllowance(
      workspace.id,
      workspace.planId,
      yearly ? endOfMonth() : period.end,
      ref,
    );
  },

  /** Cron: monthly allowance for free workspaces and yearly subscribers. */
  async grantMonthlyAllowances() {
    const month = new Date().toISOString().slice(0, 7);
    const workspaces = await prisma.workspace.findMany({
      where: {
        OR: [
          { planId: 'free' },
          { billingInterval: 'year', subscriptionStatus: { in: ['ACTIVE', 'TRIALING'] } },
        ],
      },
      select: { id: true, planId: true, billingInterval: true },
    });
    for (const ws of workspaces) {
      const ref = ws.planId === 'free' ? `free:${ws.id}:${month}` : `yearly:${ws.id}:${month}`;
      if (await prisma.creditLot.findUnique({ where: { externalRef: ref } })) continue;
      await creditService.resetSubscriptionAllowance(ws.id, ws.planId, endOfMonth(), ref);
    }
  },
};
