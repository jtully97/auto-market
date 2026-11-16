import { PLATFORM_SPECS, type Platform } from '@automarket/shared';
import { env } from '../../config/env.js';
import { decrypt, encrypt, randomToken } from '../../core/crypto.js';
import { prisma } from '../../core/db/prisma.js';
import { BadRequestError, NotFoundError } from '../../core/errors.js';
import { logger } from '../../core/logger.js';
import type { AuthUser, WorkspaceContext } from '../../core/http/types.js';
import type { SocialAccount } from '../../generated/prisma/client.js';
import { getPlan } from '@automarket/shared';
import { getProvider, listProviders } from '../../integrations/social/registry.js';
import type { AccountCredentials, OAuthTokens } from '../../integrations/social/provider.js';

/** View: never leak tokens to the client. */
export const presentAccount = (a: SocialAccount) => ({
  id: a.id,
  platform: a.platform,
  name: a.name,
  handle: a.handle,
  avatarUrl: a.avatarUrl,
  brandId: a.brandId,
  status: a.status,
  lastError: a.lastError,
  tokenExpiresAt: a.tokenExpiresAt,
  createdAt: a.createdAt,
});

export const socialAccountService = {
  platforms() {
    return listProviders().map((p) => ({
      platform: p.platform,
      ...PLATFORM_SPECS[p.platform],
      configured: p.isConfigured(),
    }));
  },

  async list(ws: WorkspaceContext, brandId?: string) {
    const accounts = await prisma.socialAccount.findMany({
      where: {
        workspaceId: ws.id,
        status: { not: 'DISCONNECTED' },
        ...(brandId ? { brandId } : {}),
      },
      orderBy: { createdAt: 'asc' },
    });
    return accounts.map(presentAccount);
  },

  async startConnect(ws: WorkspaceContext, user: AuthUser, platform: Platform, brandId?: string) {
    const provider = getProvider(platform);
    const state = randomToken(24);
    const codeVerifier = randomToken(48);
    await prisma.oAuthState.create({
      data: {
        state,
        codeVerifier,
        workspaceId: ws.id,
        userId: user.id,
        brandId,
        platform,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      },
    });
    return { url: provider.authorizeUrl(state, codeVerifier) };
  },

  /** OAuth callback (browser redirect). Always ends with a redirect back to the web app. */
  async completeConnect(
    platform: Platform,
    query: { code?: string; state?: string; error?: string },
  ) {
    const back = (params: Record<string, string>) =>
      `${env.WEB_URL}/channels?${new URLSearchParams(params)}`;
    if (query.error || !query.code || !query.state)
      return back({ error: query.error ?? 'cancelled' });

    const state = await prisma.oAuthState.findUnique({ where: { state: query.state } });
    if (!state || state.expiresAt < new Date() || state.platform !== platform)
      return back({ error: 'expired' });
    await prisma.oAuthState.delete({ where: { id: state.id } });

    try {
      const workspace = await prisma.workspace.findUniqueOrThrow({
        where: { id: state.workspaceId },
      });
      const plan = getPlan(workspace.planId);
      const { tokens, profiles } = await getProvider(platform).connect(
        query.code,
        state.codeVerifier ?? '',
      );
      let connected = 0;
      for (const profile of profiles) {
        const current = await prisma.socialAccount.count({
          where: { workspaceId: workspace.id, status: { not: 'DISCONNECTED' } },
        });
        const exists = await prisma.socialAccount.findUnique({
          where: {
            workspaceId_platform_externalId: {
              workspaceId: workspace.id,
              platform,
              externalId: profile.externalId,
            },
          },
        });
        if (!exists && current >= plan.limits.socialAccounts) break;
        const t: OAuthTokens = profile.tokens ?? tokens;
        const data = {
          name: profile.name,
          handle: profile.handle,
          avatarUrl: profile.avatarUrl,
          accessTokenEnc: encrypt(t.accessToken),
          refreshTokenEnc: t.refreshToken ? encrypt(t.refreshToken) : null,
          tokenExpiresAt: t.expiresAt ?? null,
          scopes: t.scopes,
          status: 'CONNECTED' as const,
          lastError: null,
          metadata: (profile.metadata ?? {}) as object,
          brandId: state.brandId,
        };
        await prisma.socialAccount.upsert({
          where: {
            workspaceId_platform_externalId: {
              workspaceId: workspace.id,
              platform,
              externalId: profile.externalId,
            },
          },
          create: { workspaceId: workspace.id, platform, externalId: profile.externalId, ...data },
          update: data,
        });
        connected++;
      }
      if (!connected) return back({ error: 'limit' });
      return back({ connected: platform.toLowerCase(), count: String(connected) });
    } catch (err) {
      logger.error({ err, platform }, 'Social connect failed');
      return back({ error: 'connect_failed', platform: platform.toLowerCase() });
    }
  },

  async update(ws: WorkspaceContext, id: string, data: { brandId?: string | null }) {
    const account = await prisma.socialAccount.findFirst({ where: { id, workspaceId: ws.id } });
    if (!account) throw new NotFoundError('Social account');
    return presentAccount(await prisma.socialAccount.update({ where: { id }, data }));
  },

  async disconnect(ws: WorkspaceContext, id: string) {
    const account = await prisma.socialAccount.findFirst({ where: { id, workspaceId: ws.id } });
    if (!account) throw new NotFoundError('Social account');
    await prisma.socialAccount.update({
      where: { id },
      data: { status: 'DISCONNECTED', accessTokenEnc: '', refreshTokenEnc: null },
    });
  },

  /** Decrypt credentials, refreshing the access token first if it is about to expire. */
  async credentials(account: SocialAccount): Promise<AccountCredentials> {
    if (account.status === 'DISCONNECTED')
      throw new BadRequestError(`${account.name} is disconnected`);
    let accessToken = decrypt(account.accessTokenEnc);
    const expiresSoon =
      account.tokenExpiresAt && account.tokenExpiresAt.getTime() < Date.now() + 5 * 60 * 1000;
    if (expiresSoon && account.refreshTokenEnc) {
      const refreshed = await this.refresh(account);
      accessToken = refreshed.accessToken;
    }
    return {
      externalId: account.externalId,
      accessToken,
      metadata: (account.metadata as Record<string, unknown>) ?? {},
    };
  },

  async refresh(account: SocialAccount): Promise<OAuthTokens> {
    const provider = getProvider(account.platform);
    if (!provider.refresh || !account.refreshTokenEnc)
      throw new BadRequestError('Token cannot be refreshed');
    try {
      const tokens = await provider.refresh(decrypt(account.refreshTokenEnc));
      await prisma.socialAccount.update({
        where: { id: account.id },
        data: {
          accessTokenEnc: encrypt(tokens.accessToken),
          refreshTokenEnc: tokens.refreshToken
            ? encrypt(tokens.refreshToken)
            : account.refreshTokenEnc,
          tokenExpiresAt: tokens.expiresAt ?? null,
          status: 'CONNECTED',
          lastError: null,
        },
      });
      return tokens;
    } catch (err) {
      await prisma.socialAccount.update({
        where: { id: account.id },
        data: { status: 'EXPIRED', lastError: 'Reconnect this account — access expired' },
      });
      throw err;
    }
  },

  /** Cron: refresh tokens expiring within the next 24h. */
  async refreshExpiring() {
    const soon = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const accounts = await prisma.socialAccount.findMany({
      where: { status: 'CONNECTED', refreshTokenEnc: { not: null }, tokenExpiresAt: { lt: soon } },
    });
    for (const account of accounts) {
      await this.refresh(account).catch((err) =>
        logger.warn({ err, accountId: account.id }, 'token refresh failed'),
      );
    }
  },
};
