import bcrypt from 'bcryptjs';
import { PLANS, type LoginInput, type RegisterInput } from '@automarket/shared';
import { env } from '../../config/env.js';
import { REFRESH_TTL_DAYS, signAccessToken } from '../../core/auth/jwt.js';
import { randomToken, sha256 } from '../../core/crypto.js';
import { prisma } from '../../core/db/prisma.js';
import { ConflictError, UnauthorizedError } from '../../core/errors.js';
import { sendTransactional } from '../../integrations/email/mailer.js';
import { creditService } from '../credits/credit.service.js';

const slugify = (s: string) =>
  `${
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      .slice(0, 40) || 'workspace'
  }-${randomToken(3).toLowerCase()}`;

const DUMMY_HASH = bcrypt.hashSync('timing-safe-dummy-password', 12);

export const endOfMonth = (d = new Date()) =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));

export interface SessionMeta {
  userAgent?: string;
  ip?: string;
}

export class AuthService {
  private async issueSession(user: { id: string; email: string; name: string }, meta: SessionMeta) {
    const refreshToken = randomToken(48);
    await prisma.session.create({
      data: {
        userId: user.id,
        tokenHash: sha256(refreshToken),
        userAgent: meta.userAgent?.slice(0, 300),
        ip: meta.ip,
        expiresAt: new Date(Date.now() + REFRESH_TTL_DAYS * 86400_000),
      },
    });
    return {
      accessToken: signAccessToken({ sub: user.id, email: user.email, name: user.name }),
      refreshToken,
    };
  }

  async register(input: RegisterInput, meta: SessionMeta) {
    if (await prisma.user.findUnique({ where: { email: input.email } })) {
      throw new ConflictError('An account with that email already exists');
    }
    const passwordHash = await bcrypt.hash(input.password, 12);
    const workspaceName = input.workspaceName ?? `${input.name.split(' ')[0]}'s workspace`;

    const { user, workspace } = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { email: input.email, name: input.name, passwordHash },
      });
      const workspace = await tx.workspace.create({
        data: {
          name: workspaceName,
          slug: slugify(workspaceName),
          memberships: { create: { userId: user.id, role: 'OWNER' } },
          brands: { create: { name: input.workspaceName ?? input.name } },
        },
      });
      return { user, workspace };
    });

    await creditService.grant(workspace.id, {
      source: 'SUBSCRIPTION',
      amount: PLANS.free.monthlyCredits,
      expiresAt: endOfMonth(),
      externalRef: `free:${workspace.id}:${new Date().toISOString().slice(0, 7)}`,
      description: 'Free plan monthly credits',
    });

    return { user, workspaceId: workspace.id, ...(await this.issueSession(user, meta)) };
  }

  async login(input: LoginInput, meta: SessionMeta) {
    const user = await prisma.user.findUnique({ where: { email: input.email } });
    // Compare against a dummy hash when the user is missing to keep timing uniform.
    const ok = await bcrypt.compare(input.password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !ok) throw new UnauthorizedError('Email or password is incorrect');
    return { user, ...(await this.issueSession(user, meta)) };
  }

  /** Refresh-token rotation: each refresh token is single-use. Reuse revokes all sessions. */
  async refresh(refreshToken: string, meta: SessionMeta) {
    const session = await prisma.session.findUnique({
      where: { tokenHash: sha256(refreshToken) },
      include: { user: true },
    });
    if (!session || session.expiresAt < new Date()) throw new UnauthorizedError('Session expired');
    if (session.revokedAt) {
      await prisma.session.updateMany({
        where: { userId: session.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedError('Session expired');
    }
    await prisma.session.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
    return { user: session.user, ...(await this.issueSession(session.user, meta)) };
  }

  async logout(refreshToken?: string) {
    if (!refreshToken) return;
    await prisma.session.updateMany({
      where: { tokenHash: sha256(refreshToken) },
      data: { revokedAt: new Date() },
    });
  }

  async me(userId: string) {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        avatarUrl: true,
        createdAt: true,
        memberships: {
          select: {
            role: true,
            workspace: { select: { id: true, name: true, slug: true, planId: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    const { memberships, ...rest } = user;
    return { ...rest, workspaces: memberships.map((m) => ({ ...m.workspace, role: m.role })) };
  }

  async forgotPassword(email: string) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return; // never reveal whether an account exists
    const token = randomToken(32);
    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: sha256(token),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });
    const link = `${env.WEB_URL}/reset-password?token=${token}`;
    await sendTransactional(
      user.email,
      'Reset your AutoMarket password',
      `<p>Hi ${user.name},</p><p>Reset your password with the link below. It expires in 1 hour.</p><p><a href="${link}">Reset password</a></p>`,
    );
  }

  async resetPassword(token: string, password: string) {
    const record = await prisma.passwordResetToken.findUnique({
      where: { tokenHash: sha256(token) },
    });
    if (!record || record.usedAt || record.expiresAt < new Date())
      throw new UnauthorizedError('This reset link has expired');
    await prisma.$transaction([
      prisma.user.update({
        where: { id: record.userId },
        data: { passwordHash: await bcrypt.hash(password, 12) },
      }),
      prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
      prisma.session.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
  }
}

export const authService = new AuthService();
