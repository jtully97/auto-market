import { getPlan, type AiAction } from '@automarket/shared';
import { prisma, type Tx } from '../../core/db/prisma.js';
import {
  InsufficientCreditsError,
  NotFoundError,
  PlanLimitError,
  RateLimitError,
} from '../../core/errors.js';
import { logger } from '../../core/logger.js';
import type { CreditSource } from '../../core/db/prisma.js';

interface Allocation {
  lotId: string;
  amount: number;
}

const RESERVATION_TTL_MS = 2 * 60 * 60 * 1000; // stale holds are auto-released after 2h

/** Serialise all credit mutations for one workspace inside a transaction. */
const lockWallet = (tx: Tx, workspaceId: string) =>
  tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtext(${`credits:${workspaceId}`}))`;

/**
 * Credit wallet. Credits live in lots (subscription allowance, packs, promos),
 * each with an expiry; spend is FIFO by expiry. AI calls follow
 * reserve → (provider call) → capture | release, so:
 *   - balances can never go negative (reserve fails up front),
 *   - users are never charged for failed generations,
 *   - concurrency and daily caps stop runaway spend before it costs us money.
 */
export class CreditService {
  async balance(workspaceId: string, db: Tx | typeof prisma = prisma) {
    const now = new Date();
    const [lots, held] = await Promise.all([
      db.creditLot.groupBy({
        by: ['source'],
        where: { workspaceId, remaining: { gt: 0 }, expiresAt: { gt: now } },
        _sum: { remaining: true },
      }),
      db.creditReservation.aggregate({
        where: { workspaceId, status: 'HELD' },
        _sum: { amount: true },
      }),
    ]);
    const by = (s: CreditSource) => lots.find((l) => l.source === s)?._sum.remaining ?? 0;
    const subscription = by('SUBSCRIPTION');
    const pack = by('PACK') + by('PROMO');
    const nextExpiry = await db.creditLot.findFirst({
      where: { workspaceId, remaining: { gt: 0 }, expiresAt: { gt: now } },
      orderBy: { expiresAt: 'asc' },
      select: { expiresAt: true, remaining: true },
    });
    return {
      available: subscription + pack,
      subscription,
      pack,
      held: held._sum.amount ?? 0,
      nextExpiry,
    };
  }

  /** Idempotent when `externalRef` is set (Stripe invoice / checkout ids). */
  async grant(
    workspaceId: string,
    opts: {
      source: CreditSource;
      amount: number;
      expiresAt: Date;
      externalRef?: string;
      description: string;
    },
  ) {
    return prisma.$transaction(async (tx) => {
      await lockWallet(tx, workspaceId);
      if (
        opts.externalRef &&
        (await tx.creditLot.findUnique({ where: { externalRef: opts.externalRef } }))
      ) {
        return null;
      }
      const lot = await tx.creditLot.create({
        data: {
          workspaceId,
          source: opts.source,
          granted: opts.amount,
          remaining: opts.amount,
          expiresAt: opts.expiresAt,
          externalRef: opts.externalRef,
        },
      });
      await this.log(
        tx,
        workspaceId,
        opts.source === 'PACK' ? 'PURCHASE' : 'GRANT',
        opts.amount,
        opts.description,
        'CreditLot',
        lot.id,
      );
      return lot;
    });
  }

  /** New billing period: forfeit unused subscription credits and grant the plan allowance. */
  async resetSubscriptionAllowance(
    workspaceId: string,
    planId: string,
    periodEnd: Date,
    externalRef: string,
  ) {
    const plan = getPlan(planId);
    await prisma.$transaction(async (tx) => {
      await lockWallet(tx, workspaceId);
      if (await tx.creditLot.findUnique({ where: { externalRef } })) return;
      const stale = await tx.creditLot.findMany({
        where: { workspaceId, source: 'SUBSCRIPTION', remaining: { gt: 0 } },
      });
      for (const lot of stale) {
        await tx.creditLot.update({
          where: { id: lot.id },
          data: { remaining: 0, expiresAt: new Date() },
        });
        await this.log(
          tx,
          workspaceId,
          'EXPIRE',
          -lot.remaining,
          'Unused monthly credits expired',
          'CreditLot',
          lot.id,
        );
      }
      const lot = await tx.creditLot.create({
        data: {
          workspaceId,
          source: 'SUBSCRIPTION',
          granted: plan.monthlyCredits,
          remaining: plan.monthlyCredits,
          expiresAt: periodEnd,
          externalRef,
        },
      });
      await this.log(
        tx,
        workspaceId,
        'GRANT',
        plan.monthlyCredits,
        `${plan.name} monthly credits`,
        'CreditLot',
        lot.id,
      );
    });
  }

  async reserve(
    workspaceId: string,
    planId: string,
    action: AiAction | string,
    amount: number,
  ): Promise<string> {
    const plan = getPlan(planId);
    return prisma.$transaction(async (tx) => {
      await lockWallet(tx, workspaceId);

      const inFlight = await tx.creditReservation.count({ where: { workspaceId, status: 'HELD' } });
      if (inFlight >= plan.limits.maxConcurrentGenerations) {
        throw new RateLimitError(
          `You can run ${plan.limits.maxConcurrentGenerations} AI generation(s) at once on ${plan.name}. Wait for one to finish.`,
        );
      }

      const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const spent24h = await tx.creditReservation.aggregate({
        where: { workspaceId, status: { in: ['HELD', 'CAPTURED'] }, createdAt: { gte: since } },
        _sum: { amount: true },
      });
      if ((spent24h._sum.amount ?? 0) + amount > plan.limits.dailyCreditSpendCap) {
        throw new PlanLimitError(
          `Daily AI limit reached for ${plan.name} (${plan.limits.dailyCreditSpendCap} credits / 24h).`,
          {
            limit: 'dailyCreditSpendCap',
            planId: plan.id,
          },
        );
      }

      const lots = await tx.creditLot.findMany({
        where: { workspaceId, remaining: { gt: 0 }, expiresAt: { gt: new Date() } },
        orderBy: [{ expiresAt: 'asc' }, { createdAt: 'asc' }],
      });
      const available = lots.reduce((sum, l) => sum + l.remaining, 0);
      if (available < amount) throw new InsufficientCreditsError(amount, available);

      const allocations: Allocation[] = [];
      let needed = amount;
      for (const lot of lots) {
        if (needed === 0) break;
        const take = Math.min(lot.remaining, needed);
        await tx.creditLot.update({
          where: { id: lot.id },
          data: { remaining: { decrement: take } },
        });
        allocations.push({ lotId: lot.id, amount: take });
        needed -= take;
      }

      const reservation = await tx.creditReservation.create({
        data: {
          workspaceId,
          amount,
          action,
          allocations: allocations as unknown as object,
          expiresAt: new Date(Date.now() + RESERVATION_TTL_MS),
        },
      });
      await this.log(
        tx,
        workspaceId,
        'RESERVE',
        -amount,
        `Reserved for ${action}`,
        'CreditReservation',
        reservation.id,
      );
      return reservation.id;
    });
  }

  async capture(reservationId: string) {
    await prisma.$transaction(async (tx) => {
      const r = await tx.creditReservation.findUnique({ where: { id: reservationId } });
      if (!r) throw new NotFoundError('Reservation');
      if (r.status !== 'HELD') return;
      await lockWallet(tx, r.workspaceId);
      await tx.creditReservation.update({
        where: { id: r.id },
        data: { status: 'CAPTURED', settledAt: new Date() },
      });
      await this.log(
        tx,
        r.workspaceId,
        'CAPTURE',
        0,
        `Charged ${r.amount} credits for ${r.action}`,
        'CreditReservation',
        r.id,
      );
    });
  }

  /** Return held credits to the exact lots they came from. */
  async release(reservationId: string, reason = 'Generation failed — credits returned') {
    await prisma.$transaction(async (tx) => {
      const r = await tx.creditReservation.findUnique({ where: { id: reservationId } });
      if (!r || r.status !== 'HELD') return;
      await lockWallet(tx, r.workspaceId);
      for (const a of r.allocations as unknown as Allocation[]) {
        await tx.creditLot.update({
          where: { id: a.lotId },
          data: { remaining: { increment: a.amount } },
        });
      }
      await tx.creditReservation.update({
        where: { id: r.id },
        data: { status: 'RELEASED', settledAt: new Date() },
      });
      await this.log(tx, r.workspaceId, 'RELEASE', r.amount, reason, 'CreditReservation', r.id);
    });
  }

  /**
   * Convenience wrapper for synchronous AI calls:
   * reserve, run, capture on success, release on any error.
   */
  async withReservation<T>(
    workspaceId: string,
    planId: string,
    action: AiAction,
    amount: number,
    run: (reservationId: string) => Promise<T>,
  ) {
    const reservationId = await this.reserve(workspaceId, planId, action, amount);
    try {
      const result = await run(reservationId);
      await this.capture(reservationId);
      return result;
    } catch (err) {
      await this.release(reservationId);
      throw err;
    }
  }

  /** Cron: expire lots, release stale holds. */
  async maintenance() {
    const now = new Date();
    const stale = await prisma.creditReservation.findMany({
      where: { status: 'HELD', expiresAt: { lt: now } },
      select: { id: true },
    });
    for (const r of stale) await this.release(r.id, 'Stale reservation released');

    const expired = await prisma.creditLot.findMany({
      where: { remaining: { gt: 0 }, expiresAt: { lte: now } },
    });
    for (const lot of expired) {
      await prisma.$transaction(async (tx) => {
        await lockWallet(tx, lot.workspaceId);
        await tx.creditLot.update({ where: { id: lot.id }, data: { remaining: 0 } });
        await this.log(
          tx,
          lot.workspaceId,
          'EXPIRE',
          -lot.remaining,
          `${lot.source.toLowerCase()} credits expired`,
          'CreditLot',
          lot.id,
        );
      });
    }
    if (stale.length || expired.length)
      logger.info({ stale: stale.length, expired: expired.length }, 'credit maintenance');
  }

  async history(workspaceId: string, page = 1, pageSize = 50) {
    const [items, total] = await Promise.all([
      prisma.creditTransaction.findMany({
        where: { workspaceId, type: { not: 'CAPTURE' } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.creditTransaction.count({ where: { workspaceId, type: { not: 'CAPTURE' } } }),
    ]);
    return { items, page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
  }

  private async log(
    tx: Tx,
    workspaceId: string,
    type: 'GRANT' | 'PURCHASE' | 'RESERVE' | 'CAPTURE' | 'RELEASE' | 'EXPIRE' | 'ADJUSTMENT',
    amount: number,
    description: string,
    refType: string,
    refId: string,
  ) {
    const { _sum } = await tx.creditLot.aggregate({
      where: { workspaceId, remaining: { gt: 0 }, expiresAt: { gt: new Date() } },
      _sum: { remaining: true },
    });
    await tx.creditTransaction.create({
      data: {
        workspaceId,
        type,
        amount,
        balanceAfter: _sum.remaining ?? 0,
        description,
        refType,
        refId,
      },
    });
  }
}

export const creditService = new CreditService();
