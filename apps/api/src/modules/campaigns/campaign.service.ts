import { creditsFor, getPlan, type EmailCampaignInput } from '@automarket/shared';
import { env } from '../../config/env.js';
import { prisma } from '../../core/db/prisma.js';
import { BadRequestError, NotFoundError } from '../../core/errors.js';
import { logger } from '../../core/logger.js';
import { cancelJob, enqueue } from '../../core/queue/queue.js';
import type { WorkspaceContext } from '../../core/http/types.js';
import { mailer } from '../../integrations/email/mailer.js';
import { creditService } from '../credits/credit.service.js';
import { usageService } from '../usage/usage.service.js';
import { htmlToText, personalize, renderEmail, unsubscribeUrl } from './email-renderer.js';

const EDITABLE = ['DRAFT', 'SCHEDULED'];

const recipientsWhere = (workspaceId: string, listIds: string[]) => ({
  workspaceId,
  status: 'SUBSCRIBED' as const,
  lists: { some: { listId: { in: listIds } } },
});

export const campaignService = {
  async list(ws: WorkspaceContext, q: { page: number; pageSize: number; search?: string }) {
    const where = {
      workspaceId: ws.id,
      ...(q.search ? { name: { contains: q.search, mode: 'insensitive' as const } } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.emailCampaign.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        omit: { html: true, design: true },
        include: { lists: { select: { list: { select: { id: true, name: true } } } } },
      }),
      prisma.emailCampaign.count({ where }),
    ]);
    return {
      items: items.map(({ lists, ...c }) => ({ ...c, lists: lists.map((l) => l.list) })),
      page: q.page,
      pageSize: q.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / q.pageSize)),
    };
  },

  async get(ws: WorkspaceContext, id: string) {
    const c = await prisma.emailCampaign.findFirst({
      where: { id, workspaceId: ws.id },
      include: { lists: { select: { listId: true } } },
    });
    if (!c) throw new NotFoundError('Campaign');
    return { ...c, listIds: c.lists.map((l) => l.listId) };
  },

  async validateRefs(ws: WorkspaceContext, input: EmailCampaignInput) {
    const [brand, lists] = await Promise.all([
      prisma.brand.findFirst({ where: { id: input.brandId, workspaceId: ws.id } }),
      prisma.contactList.count({ where: { id: { in: input.listIds }, workspaceId: ws.id } }),
    ]);
    if (!brand) throw new BadRequestError('Pick a brand');
    if (lists !== input.listIds.length) throw new BadRequestError('Unknown list');
  },

  async create(ws: WorkspaceContext, input: EmailCampaignInput) {
    usageService.requireFeature(ws, 'emailCampaigns', 'Email campaigns');
    await this.validateRefs(ws, input);
    const { listIds, scheduledAt: _s, design, ...data } = input;
    const c = await prisma.emailCampaign.create({
      data: {
        ...data,
        design: (design ?? undefined) as object | undefined,
        workspaceId: ws.id,
        lists: { create: listIds.map((listId) => ({ listId })) },
      },
    });
    return this.get(ws, c.id);
  },

  async update(ws: WorkspaceContext, id: string, input: EmailCampaignInput) {
    const existing = await this.get(ws, id);
    if (!EDITABLE.includes(existing.status))
      throw new BadRequestError('This campaign has already been sent');
    await this.validateRefs(ws, input);
    const { listIds, scheduledAt: _s, design, ...data } = input;
    await prisma.emailCampaign.update({
      where: { id },
      data: {
        ...data,
        design: (design ?? undefined) as object | undefined,
        lists: { deleteMany: {}, create: listIds.map((listId) => ({ listId })) },
      },
    });
    return this.get(ws, id);
  },

  async remove(ws: WorkspaceContext, id: string) {
    const c = await this.get(ws, id);
    if (c.status === 'SENDING') throw new BadRequestError('Cancel the campaign before deleting it');
    await cancelJob('campaign.send', c.jobId);
    await prisma.emailCampaign.delete({ where: { id } });
  },

  async recipientCount(ws: WorkspaceContext, listIds: string[]) {
    const count = await prisma.contact.count({ where: recipientsWhere(ws.id, listIds) });
    const used = await usageService.get(ws.id, 'emailsSent');
    const remaining = Math.max(0, ws.plan.limits.emailsPerMonth - used);
    const overage = Math.max(0, count - remaining);
    return {
      recipients: count,
      quotaRemaining: remaining,
      overageEmails: overage,
      overageCredits: creditsFor('email.overage100', Math.ceil(overage / 100)),
    };
  },

  async sendTest(ws: WorkspaceContext, id: string, to: string[]) {
    const c = await this.get(ws, id);
    const brand = await prisma.brand.findUniqueOrThrow({ where: { id: c.brandId } });
    const sample = { email: to[0]!, firstName: 'Alex', lastName: 'Sample', attributes: {} };
    for (const email of to) {
      const html = renderEmail({
        html: c.html,
        previewText: c.previewText,
        brandName: brand.name,
        sendId: 'test',
        contact: { ...sample, email },
      });
      await mailer.send({
        to: email,
        subject: `[Test] ${personalize(c.subject, sample, false)}`,
        html,
        text: htmlToText(html),
        fromName: c.fromName,
        replyTo: c.replyTo ?? undefined,
      });
    }
    return { sent: to.length };
  },

  async schedule(ws: WorkspaceContext, id: string, scheduledAt: Date | null) {
    usageService.requireFeature(ws, 'emailCampaigns', 'Email campaigns');
    const c = await this.get(ws, id);
    if (!EDITABLE.includes(c.status))
      throw new BadRequestError('This campaign has already been sent');
    if (!c.listIds.length) throw new BadRequestError('Pick at least one list');
    const { recipients, overageCredits } = await this.recipientCount(ws, c.listIds);
    if (!recipients) throw new BadRequestError('Those lists have no subscribed contacts');
    if (overageCredits) {
      const balance = await creditService.balance(ws.id);
      if (balance.available < overageCredits) {
        throw new BadRequestError(
          `This send exceeds your monthly email quota and needs ${overageCredits} credits (you have ${balance.available}).`,
        );
      }
    }
    await cancelJob('campaign.send', c.jobId);
    const at = scheduledAt ?? new Date();
    const jobId = await enqueue('campaign.send', { campaignId: id }, { startAfter: at });
    await prisma.emailCampaign.update({
      where: { id },
      data: { status: 'SCHEDULED', scheduledAt: at, jobId },
    });
    return this.get(ws, id);
  },

  async cancel(ws: WorkspaceContext, id: string) {
    const c = await this.get(ws, id);
    if (!['SCHEDULED', 'SENDING'].includes(c.status))
      throw new BadRequestError('Nothing to cancel');
    await cancelJob('campaign.send', c.jobId);
    await prisma.emailCampaign.update({
      where: { id },
      data: { status: c.status === 'SENDING' ? 'CANCELED' : 'DRAFT', jobId: null },
    });
    return this.get(ws, id);
  },

  /** Worker: snapshot recipients, charge overage, fan out into batches. */
  async startSend(campaignId: string) {
    const c = await prisma.emailCampaign.findUnique({
      where: { id: campaignId },
      include: { lists: true, workspace: true },
    });
    if (!c || c.status !== 'SCHEDULED') return;
    await prisma.emailCampaign.update({ where: { id: c.id }, data: { status: 'SENDING' } });

    const contacts = await prisma.contact.findMany({
      where: recipientsWhere(
        c.workspaceId,
        c.lists.map((l) => l.listId),
      ),
      select: { id: true },
    });
    await prisma.emailSend.createMany({
      data: contacts.map((ct) => ({ campaignId: c.id, contactId: ct.id })),
      skipDuplicates: true,
    });

    const plan = getPlan(c.workspace.planId);
    const used = await usageService.get(c.workspaceId, 'emailsSent');
    const overage = Math.max(0, contacts.length - Math.max(0, plan.limits.emailsPerMonth - used));
    if (overage) {
      try {
        const credits = creditsFor('email.overage100', Math.ceil(overage / 100));
        const reservation = await creditService.reserve(
          c.workspaceId,
          c.workspace.planId,
          'email.overage100',
          credits,
        );
        await creditService.capture(reservation);
      } catch (err) {
        await prisma.emailCampaign.update({ where: { id: c.id }, data: { status: 'FAILED' } });
        logger.warn({ err, campaignId: c.id }, 'campaign overage could not be charged');
        return;
      }
    }
    await usageService.increment(c.workspaceId, 'emailsSent', contacts.length);
    await prisma.emailCampaign.update({
      where: { id: c.id },
      data: { recipientsCount: contacts.length },
    });

    const sends = await prisma.emailSend.findMany({
      where: { campaignId: c.id, status: 'QUEUED' },
      select: { id: true },
    });
    for (let i = 0; i < sends.length; i += env.EMAIL_BATCH_SIZE) {
      await enqueue('campaign.batch', {
        campaignId: c.id,
        sendIds: sends.slice(i, i + env.EMAIL_BATCH_SIZE).map((s) => s.id),
      });
    }
    if (!sends.length)
      await prisma.emailCampaign.update({
        where: { id: c.id },
        data: { status: 'SENT', sentAt: new Date() },
      });
  },

  async sendBatch(campaignId: string, sendIds: string[]) {
    const c = await prisma.emailCampaign.findUnique({
      where: { id: campaignId },
      include: { brand: true },
    });
    if (!c || c.status !== 'SENDING') return;
    const sends = await prisma.emailSend.findMany({
      where: { id: { in: sendIds }, status: 'QUEUED' },
      include: { contact: true },
    });
    let sent = 0;
    let failed = 0;
    for (const s of sends) {
      if (s.contact.status !== 'SUBSCRIBED') {
        await prisma.emailSend.update({
          where: { id: s.id },
          data: { status: 'FAILED', error: 'Contact unsubscribed' },
        });
        continue;
      }
      try {
        const html = renderEmail({
          html: c.html,
          previewText: c.previewText,
          brandName: c.brand.name,
          sendId: s.id,
          contact: s.contact,
        });
        const unsub = unsubscribeUrl(s.id);
        const { messageId } = await mailer.send({
          to: s.contact.email,
          subject: personalize(c.subject, s.contact, false),
          html,
          text: htmlToText(html),
          fromName: c.fromName,
          replyTo: c.replyTo ?? undefined,
          headers: {
            'List-Unsubscribe': `<${unsub}>`,
            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
          },
        });
        await prisma.emailSend.update({
          where: { id: s.id },
          data: { status: 'SENT', messageId, sentAt: new Date() },
        });
        sent++;
      } catch (err) {
        failed++;
        await prisma.emailSend.update({
          where: { id: s.id },
          data: {
            status: 'FAILED',
            error: err instanceof Error ? err.message.slice(0, 500) : 'failed',
          },
        });
      }
    }
    await prisma.emailCampaign.update({
      where: { id: c.id },
      data: { sentCount: { increment: sent }, failedCount: { increment: failed } },
    });
    const remaining = await prisma.emailSend.count({
      where: { campaignId: c.id, status: 'QUEUED' },
    });
    if (!remaining)
      await prisma.emailCampaign.updateMany({
        where: { id: c.id, status: 'SENDING' },
        data: { status: 'SENT', sentAt: new Date() },
      });
  },

  // ── Tracking ──
  async trackOpen(sendId: string) {
    const s = await prisma.emailSend.updateMany({
      where: { id: sendId, openedAt: null },
      data: { openedAt: new Date() },
    });
    if (s.count) {
      const send = await prisma.emailSend.findUnique({
        where: { id: sendId },
        select: { campaignId: true },
      });
      if (send)
        await prisma.emailCampaign.update({
          where: { id: send.campaignId },
          data: { openCount: { increment: 1 } },
        });
    }
  },

  async trackClick(sendId: string) {
    const s = await prisma.emailSend.updateMany({
      where: { id: sendId, clickedAt: null },
      data: { clickedAt: new Date() },
    });
    if (s.count) {
      const send = await prisma.emailSend.findUnique({
        where: { id: sendId },
        select: { campaignId: true },
      });
      if (send)
        await prisma.emailCampaign.update({
          where: { id: send.campaignId },
          data: { clickCount: { increment: 1 } },
        });
    }
    await this.trackOpen(sendId);
  },

  async unsubscribe(sendId: string) {
    const send = await prisma.emailSend.findUnique({
      where: { id: sendId },
      include: { contact: true },
    });
    if (!send || send.contact.status === 'UNSUBSCRIBED') return;
    await prisma.$transaction([
      prisma.contact.update({
        where: { id: send.contactId },
        data: { status: 'UNSUBSCRIBED', unsubscribedAt: new Date() },
      }),
      prisma.emailCampaign.update({
        where: { id: send.campaignId },
        data: { unsubscribeCount: { increment: 1 } },
      }),
    ]);
  },
};
