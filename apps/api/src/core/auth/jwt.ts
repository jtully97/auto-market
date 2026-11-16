import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';

export const ACCESS_COOKIE = 'am_access';
export const REFRESH_COOKIE = 'am_refresh';
export const ACCESS_TTL_SECONDS = 15 * 60;
export const REFRESH_TTL_DAYS = 30;

export interface AccessClaims {
  sub: string;
  email: string;
  name: string;
}

export const signAccessToken = (claims: AccessClaims): string =>
  jwt.sign(claims, env.JWT_SECRET, { expiresIn: ACCESS_TTL_SECONDS, issuer: 'automarket' });

export const verifyAccessToken = (token: string): AccessClaims | null => {
  try {
    return jwt.verify(token, env.JWT_SECRET, { issuer: 'automarket' }) as AccessClaims;
  } catch {
    return null;
  }
};

/** Short-lived signed tokens for links in emails (unsubscribe, tracking). */
export const signLinkToken = (payload: object, expiresIn: jwt.SignOptions['expiresIn'] = '365d') =>
  jwt.sign(payload, env.JWT_SECRET, { expiresIn, issuer: 'automarket-link' });

export const verifyLinkToken = <T>(token: string): T | null => {
  try {
    return jwt.verify(token, env.JWT_SECRET, { issuer: 'automarket-link' }) as T;
  } catch {
    return null;
  }
};
