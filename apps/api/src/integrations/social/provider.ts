import { createHash } from 'node:crypto';
import type { Platform } from '@automarket/shared';
import { env } from '../../config/env.js';
import { BadRequestError, ExternalServiceError } from '../../core/errors.js';

export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
  scopes: string[];
}

/** One connectable destination (a FB Page, an IG business account, a channel...). */
export interface ConnectedProfile {
  externalId: string;
  name: string;
  handle?: string;
  avatarUrl?: string;
  /** Overrides the user-level token (e.g. Facebook Page access tokens). */
  tokens?: OAuthTokens;
  metadata?: Record<string, unknown>;
}

export interface AccountCredentials {
  externalId: string;
  accessToken: string;
  metadata: Record<string, unknown>;
}

export interface PublishMedia {
  kind: 'IMAGE' | 'VIDEO';
  url: string;
  mimeType: string;
}

export interface PublishInput {
  account: AccountCredentials;
  caption: string;
  media: PublishMedia[];
  options: Record<string, unknown>;
}

export interface PublishResult {
  externalPostId: string;
  url?: string;
}

export interface PostMetrics {
  impressions: number;
  reach: number;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  clicks: number;
}

export interface AccountMetrics {
  followers: number;
  impressions?: number;
  reach?: number;
  profileViews?: number;
}

export const emptyMetrics = (): PostMetrics => ({
  impressions: 0,
  reach: 0,
  views: 0,
  likes: 0,
  comments: 0,
  shares: 0,
  saves: 0,
  clicks: 0,
});

export interface SocialProvider {
  readonly platform: Platform;
  isConfigured(): boolean;
  authorizeUrl(state: string, codeVerifier: string): string;
  connect(
    code: string,
    codeVerifier: string,
  ): Promise<{ tokens: OAuthTokens; profiles: ConnectedProfile[] }>;
  refresh?(refreshToken: string): Promise<OAuthTokens>;
  publish(input: PublishInput): Promise<PublishResult>;
  fetchPostMetrics(account: AccountCredentials, externalPostId: string): Promise<PostMetrics>;
  fetchAccountMetrics(account: AccountCredentials): Promise<AccountMetrics>;
}

export interface OAuthConfig {
  authorizeUrl: string;
  tokenUrl: string;
  clientId?: string;
  clientSecret?: string;
  scopes: string[];
  scopeSeparator?: string;
  pkce?: boolean;
  /** Some providers (X) want client credentials as HTTP Basic auth. */
  basicAuth?: boolean;
  clientIdParam?: string;
  extraAuthorizeParams?: Record<string, string>;
}

export const pkceChallenge = (verifier: string) =>
  createHash('sha256').update(verifier).digest('base64url');

/**
 * Shared OAuth 2.0 + HTTP plumbing. Concrete providers declare their OAuth
 * config and implement only the platform-specific publish/metrics calls.
 */
export abstract class OAuth2Provider implements SocialProvider {
  abstract readonly platform: Platform;
  protected abstract readonly oauth: OAuthConfig;

  isConfigured() {
    return Boolean(this.oauth.clientId && this.oauth.clientSecret);
  }

  protected get redirectUri() {
    return `${env.API_URL}/v1/social-accounts/callback/${this.platform.toLowerCase()}`;
  }

  authorizeUrl(state: string, codeVerifier: string): string {
    if (!this.isConfigured())
      throw new BadRequestError(`${this.platform} is not configured on this server`);
    const params = new URLSearchParams({
      [this.oauth.clientIdParam ?? 'client_id']: this.oauth.clientId!,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      scope: this.oauth.scopes.join(this.oauth.scopeSeparator ?? ' '),
      state,
      ...this.oauth.extraAuthorizeParams,
    });
    if (this.oauth.pkce) {
      params.set('code_challenge', pkceChallenge(codeVerifier));
      params.set('code_challenge_method', 'S256');
    }
    return `${this.oauth.authorizeUrl}?${params}`;
  }

  protected async tokenRequest(params: Record<string, string>): Promise<OAuthTokens> {
    const body = new URLSearchParams(params);
    const headers: Record<string, string> = { 'Content-Type': 'application/x-www-form-urlencoded' };
    if (this.oauth.basicAuth) {
      headers.Authorization = `Basic ${Buffer.from(`${this.oauth.clientId}:${this.oauth.clientSecret}`).toString('base64')}`;
    } else {
      body.set(this.oauth.clientIdParam ?? 'client_id', this.oauth.clientId!);
      body.set('client_secret', this.oauth.clientSecret!);
    }
    const data = await this.http<{
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
    }>(this.oauth.tokenUrl, { method: 'POST', headers, body });
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : undefined,
      scopes: data.scope ? data.scope.split(/[ ,]+/) : this.oauth.scopes,
    };
  }

  protected exchangeCode(code: string, codeVerifier: string) {
    return this.tokenRequest({
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.redirectUri,
      ...(this.oauth.pkce ? { code_verifier: codeVerifier } : {}),
    });
  }

  refresh(refreshToken: string): Promise<OAuthTokens> {
    return this.tokenRequest({ grant_type: 'refresh_token', refresh_token: refreshToken });
  }

  protected async http<T>(url: string, init: RequestInit & { token?: string } = {}): Promise<T> {
    const { token, ...rest } = init;
    const headers = new Headers(rest.headers);
    if (token) headers.set('Authorization', `Bearer ${token}`);
    if (rest.body && typeof rest.body === 'string' && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
    const res = await fetch(url, { ...rest, headers });
    const text = await res.text();
    if (!res.ok)
      throw new ExternalServiceError(this.platform, `${res.status}: ${text.slice(0, 500)}`);
    return (text ? JSON.parse(text) : {}) as T;
  }

  protected async download(url: string): Promise<Buffer> {
    const res = await fetch(url);
    if (!res.ok)
      throw new ExternalServiceError(this.platform, `Could not read media (${res.status})`);
    return Buffer.from(await res.arrayBuffer());
  }

  protected sleep(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
  }

  abstract connect(
    code: string,
    codeVerifier: string,
  ): Promise<{ tokens: OAuthTokens; profiles: ConnectedProfile[] }>;
  abstract publish(input: PublishInput): Promise<PublishResult>;
  abstract fetchPostMetrics(
    account: AccountCredentials,
    externalPostId: string,
  ): Promise<PostMetrics>;
  abstract fetchAccountMetrics(account: AccountCredentials): Promise<AccountMetrics>;
}
