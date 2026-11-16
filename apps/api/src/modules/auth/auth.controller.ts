import type { CookieOptions, Request, Response } from 'express';
import type { LoginInput, RegisterInput } from '@automarket/shared';
import { env, isProd } from '../../config/env.js';
import {
  ACCESS_COOKIE,
  ACCESS_TTL_SECONDS,
  REFRESH_COOKIE,
  REFRESH_TTL_DAYS,
} from '../../core/auth/jwt.js';
import { UnauthorizedError } from '../../core/errors.js';
import { created, noContent } from '../../core/http/responses.js';
import type { AuthUser } from '../../core/http/types.js';
import { authService } from './auth.service.js';

const cookieBase = (): CookieOptions => ({
  httpOnly: true,
  secure: env.COOKIE_SECURE || isProd,
  sameSite: 'lax',
  domain: env.COOKIE_DOMAIN,
  path: '/',
});

const setSessionCookies = (
  res: Response,
  tokens: { accessToken: string; refreshToken: string },
) => {
  res.cookie(ACCESS_COOKIE, tokens.accessToken, {
    ...cookieBase(),
    maxAge: ACCESS_TTL_SECONDS * 1000,
  });
  res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
    ...cookieBase(),
    maxAge: REFRESH_TTL_DAYS * 86400_000,
  });
};

const meta = (req: Request) => ({ userAgent: req.get('user-agent'), ip: req.ip });

export const authController = {
  register: async ({ body, req, res }: { body: RegisterInput; req: Request; res: Response }) => {
    const result = await authService.register(body, meta(req));
    setSessionCookies(res, result);
    return created({ user: await authService.me(result.user.id), workspaceId: result.workspaceId });
  },

  login: async ({ body, req, res }: { body: LoginInput; req: Request; res: Response }) => {
    const result = await authService.login(body, meta(req));
    setSessionCookies(res, result);
    return { user: await authService.me(result.user.id) };
  },

  refresh: async ({ req, res }: { req: Request; res: Response }) => {
    const token = req.cookies?.[REFRESH_COOKIE] as string | undefined;
    if (!token) throw new UnauthorizedError();
    const result = await authService.refresh(token, meta(req));
    setSessionCookies(res, result);
    return { ok: true };
  },

  logout: async ({ req, res }: { req: Request; res: Response }) => {
    await authService.logout(req.cookies?.[REFRESH_COOKIE]);
    res.clearCookie(ACCESS_COOKIE, cookieBase());
    res.clearCookie(REFRESH_COOKIE, cookieBase());
    return noContent();
  },

  me: ({ user }: { user: AuthUser }) => authService.me(user.id),

  forgotPassword: async ({ body }: { body: { email: string } }) => {
    await authService.forgotPassword(body.email);
    return { ok: true };
  },

  resetPassword: async ({ body }: { body: { token: string; password: string } }) => {
    await authService.resetPassword(body.token, body.password);
    return { ok: true };
  },
};
