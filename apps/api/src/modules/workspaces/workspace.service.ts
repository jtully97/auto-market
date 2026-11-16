import { PLANS } from '@automarket/shared';
import { env } from '../../config/env.js';
import { randomToken, sha256 } from '../../core/crypto.js';
import { prisma, type WorkspaceRole } from '../../core/db/prisma.js';
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '../../core/errors.js';
import type { AuthUser, WorkspaceContext } from '../../core/http/types.js';
import { sendTransactional } from '../../integrations/email/mailer.js';
import { endOfMonth } from '../auth/auth.service.js';
import { creditService } from '../credits/credit.service.js';
import { usageService } from '../usage/usage.service.js';

export const workspaceService = {
  async create(user: AuthUser, name: string) {
    const ws = await prisma.workspace.create({
      data: {
        name,
        slug: `${name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .slice(0, 40)}-${randomToken(3).toLowerCase()}`,
        memberships: { create: { userId: user.id, role: 'OWNER' } },
        brands: { create: { name } },
      },
    });
    await creditService.grant(ws.id, {
      source: 'SUBSCRIPTION',
      amount: PLANS.free.monthlyCredits,
      expiresAt: endOfMonth(),
      externalRef: `free:${ws.id}:${new Date().toISOString().slice(0, 7)}`,
      description: 'Free plan monthly credits',
    });
    return ws;
  },

  async get(ws: WorkspaceContext) {
    const workspace = await prisma.workspace.findUniqueOrThrow({
      where: { id: ws.id },
      select: {
        id: true,
        name: true,
        slug: true,
        timezone: true,
        planId: true,
        billingInterval: true,
        subscriptionStatus: true,
        currentPeriodEnd: true,
        cancelAtPeriodEnd: true,
        createdAt: true,
      },
    });
    const [usage, credits] = await Promise.all([
      usageService.summary(ws),
      creditService.balance(ws.id),
    ]);
    return { ...workspace, role: ws.role, plan: ws.plan, usage, credits };
  },

  update(ws: WorkspaceContext, data: { name?: string; timezone?: string }) {
    return prisma.workspace.update({ where: { id: ws.id }, data });
  },

  members(ws: WorkspaceContext) {
    return Promise.all([
      prisma.membership.findMany({
        where: { workspaceId: ws.id },
        select: {
          id: true,
          role: true,
          createdAt: true,
          user: { select: { id: true, name: true, email: true, avatarUrl: true } },
        },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.invitation.findMany({
        where: { workspaceId: ws.id, acceptedAt: null, expiresAt: { gt: new Date() } },
        select: { id: true, email: true, role: true, createdAt: true },
      }),
    ]).then(([members, invitations]) => ({ members, invitations }));
  },

  async invite(
    ws: WorkspaceContext,
    inviter: AuthUser,
    email: string,
    role: Exclude<WorkspaceRole, 'OWNER'>,
  ) {
    const seats = await prisma.membership.count({ where: { workspaceId: ws.id } });
    usageService.assertWithinLimit(ws, 'seats', seats, 1, 'team seats');
    const existing = await prisma.membership.findFirst({
      where: { workspaceId: ws.id, user: { email } },
    });
    if (existing) throw new ConflictError('That person is already a member');
    const token = randomToken(32);
    await prisma.invitation.create({
      data: {
        workspaceId: ws.id,
        email,
        role,
        tokenHash: sha256(token),
        expiresAt: new Date(Date.now() + 7 * 86400_000),
      },
    });
    const link = `${env.WEB_URL}/invite?token=${token}`;
    await sendTransactional(
      email,
      `${inviter.name} invited you to ${ws.name} on AutoMarket`,
      `<p>${inviter.name} invited you to join <b>${ws.name}</b> as ${role.toLowerCase()}.</p><p><a href="${link}">Accept invitation</a></p>`,
    );
    return { ok: true };
  },

  async acceptInvite(user: AuthUser, token: string) {
    const invite = await prisma.invitation.findUnique({ where: { tokenHash: sha256(token) } });
    if (!invite || invite.acceptedAt || invite.expiresAt < new Date())
      throw new NotFoundError('Invitation');
    if (invite.email.toLowerCase() !== user.email.toLowerCase()) {
      throw new ForbiddenError(`This invitation was sent to ${invite.email}`);
    }
    await prisma.$transaction([
      prisma.membership.upsert({
        where: { workspaceId_userId: { workspaceId: invite.workspaceId, userId: user.id } },
        create: { workspaceId: invite.workspaceId, userId: user.id, role: invite.role },
        update: {},
      }),
      prisma.invitation.update({ where: { id: invite.id }, data: { acceptedAt: new Date() } }),
    ]);
    return { workspaceId: invite.workspaceId };
  },

  async removeMember(ws: WorkspaceContext, membershipId: string) {
    const m = await prisma.membership.findFirst({
      where: { id: membershipId, workspaceId: ws.id },
    });
    if (!m) throw new NotFoundError('Member');
    if (m.role === 'OWNER') throw new BadRequestError('The workspace owner cannot be removed');
    await prisma.membership.delete({ where: { id: m.id } });
  },

  async updateMemberRole(
    ws: WorkspaceContext,
    membershipId: string,
    role: Exclude<WorkspaceRole, 'OWNER'>,
  ) {
    const m = await prisma.membership.findFirst({
      where: { id: membershipId, workspaceId: ws.id },
    });
    if (!m) throw new NotFoundError('Member');
    if (m.role === 'OWNER') throw new BadRequestError("The owner's role cannot be changed");
    return prisma.membership.update({ where: { id: m.id }, data: { role } });
  },
};
