import { env } from '../../config/env.js';
import { ExternalServiceError } from '../../core/errors.js';
import {
  OAuth2Provider,
  emptyMetrics,
  type AccountCredentials,
  type AccountMetrics,
  type OAuthConfig,
  type PostMetrics,
  type PublishInput,
  type PublishResult,
} from './provider.js';

const REST = 'https://api.linkedin.com/rest';
const VERSION = process.env.LINKEDIN_API_VERSION ?? '202510';

export class LinkedInProvider extends OAuth2Provider {
  readonly platform = 'LINKEDIN' as const;
  protected readonly oauth: OAuthConfig = {
    authorizeUrl: 'https://www.linkedin.com/oauth/v2/authorization',
    tokenUrl: 'https://www.linkedin.com/oauth/v2/accessToken',
    clientId: env.LINKEDIN_CLIENT_ID,
    clientSecret: env.LINKEDIN_CLIENT_SECRET,
    scopes: ['openid', 'profile', 'w_member_social'],
  };

  private headers(token: string) {
    return {
      Authorization: `Bearer ${token}`,
      'LinkedIn-Version': VERSION,
      'X-Restli-Protocol-Version': '2.0.0',
      'Content-Type': 'application/json',
    };
  }

  async connect(code: string, verifier: string) {
    const tokens = await this.exchangeCode(code, verifier);
    const me = await this.http<{ sub: string; name: string; picture?: string }>(
      'https://api.linkedin.com/v2/userinfo',
      {
        token: tokens.accessToken,
      },
    );
    return {
      tokens,
      profiles: [
        {
          externalId: me.sub,
          name: me.name,
          avatarUrl: me.picture,
          metadata: { urn: `urn:li:person:${me.sub}` },
        },
      ],
    };
  }

  private async uploadImage(token: string, owner: string, url: string): Promise<string> {
    const init = await this.http<{ value: { uploadUrl: string; image: string } }>(
      `${REST}/images?action=initializeUpload`,
      {
        method: 'POST',
        headers: this.headers(token),
        body: JSON.stringify({ initializeUploadRequest: { owner } }),
      },
    );
    const bytes = await this.download(url);
    const put = await fetch(init.value.uploadUrl, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}` },
      body: new Uint8Array(bytes),
    });
    if (!put.ok) throw new ExternalServiceError('LINKEDIN', `Image upload failed (${put.status})`);
    return init.value.image;
  }

  async publish({ account, caption, media }: PublishInput): Promise<PublishResult> {
    const author = (account.metadata.urn as string) ?? `urn:li:person:${account.externalId}`;
    const images = media.filter((m) => m.kind === 'IMAGE');
    const body: Record<string, unknown> = {
      author,
      commentary: caption,
      visibility: 'PUBLIC',
      distribution: {
        feedDistribution: 'MAIN_FEED',
        targetEntities: [],
        thirdPartyDistributionChannels: [],
      },
      lifecycleState: 'PUBLISHED',
      isReshareDisabledByAuthor: false,
    };
    if (images.length === 1) {
      body.content = {
        media: { id: await this.uploadImage(account.accessToken, author, images[0]!.url) },
      };
    } else if (images.length > 1) {
      const ids = [];
      for (const img of images.slice(0, 9))
        ids.push({ id: await this.uploadImage(account.accessToken, author, img.url) });
      body.content = { multiImage: { images: ids } };
    }
    const res = await fetch(`${REST}/posts`, {
      method: 'POST',
      headers: this.headers(account.accessToken),
      body: JSON.stringify(body),
    });
    if (!res.ok)
      throw new ExternalServiceError(
        'LINKEDIN',
        `${res.status}: ${(await res.text()).slice(0, 300)}`,
      );
    const urn = res.headers.get('x-restli-id') ?? '';
    return {
      externalPostId: urn,
      url: urn ? `https://www.linkedin.com/feed/update/${urn}` : undefined,
    };
  }

  /** Member post analytics require LinkedIn's restricted Community Management API. */
  async fetchPostMetrics(account: AccountCredentials, urn: string): Promise<PostMetrics> {
    const m = emptyMetrics();
    try {
      const res = await this.http<{
        likesSummary?: { totalLikes?: number };
        commentsSummary?: { aggregatedTotalComments?: number };
      }>(`${REST}/socialActions/${encodeURIComponent(urn)}`, {
        headers: this.headers(account.accessToken),
      });
      m.likes = res.likesSummary?.totalLikes ?? 0;
      m.comments = res.commentsSummary?.aggregatedTotalComments ?? 0;
    } catch {
      /* not permitted for this app tier */
    }
    return m;
  }

  async fetchAccountMetrics(): Promise<AccountMetrics> {
    return { followers: 0 };
  }
}
