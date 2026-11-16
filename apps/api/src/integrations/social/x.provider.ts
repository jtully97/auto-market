import { env } from '../../config/env.js';
import { BadRequestError, ExternalServiceError } from '../../core/errors.js';
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

const API = 'https://api.x.com/2';

export class XProvider extends OAuth2Provider {
  readonly platform = 'X' as const;
  protected readonly oauth: OAuthConfig = {
    authorizeUrl: 'https://x.com/i/oauth2/authorize',
    tokenUrl: `${API}/oauth2/token`,
    clientId: env.X_CLIENT_ID,
    clientSecret: env.X_CLIENT_SECRET,
    scopes: ['tweet.read', 'tweet.write', 'users.read', 'offline.access', 'media.write'],
    pkce: true,
    basicAuth: true,
  };

  async connect(code: string, verifier: string) {
    const tokens = await this.exchangeCode(code, verifier);
    const { data } = await this.http<{
      data: { id: string; name: string; username: string; profile_image_url?: string };
    }>(`${API}/users/me?user.fields=profile_image_url`, { token: tokens.accessToken });
    return {
      tokens,
      profiles: [
        {
          externalId: data.id,
          name: data.name,
          handle: data.username,
          avatarUrl: data.profile_image_url,
        },
      ],
    };
  }

  private async uploadImage(token: string, url: string, mimeType: string): Promise<string> {
    const bytes = await this.download(url);
    const form = new FormData();
    form.set('media', new Blob([new Uint8Array(bytes)], { type: mimeType }));
    form.set('media_category', 'tweet_image');
    const res = await fetch(`${API}/media/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    if (!res.ok) throw new ExternalServiceError('X', `Media upload failed (${res.status})`);
    const json = (await res.json()) as { data?: { id: string }; media_id_string?: string };
    return json.data?.id ?? json.media_id_string ?? '';
  }

  async publish({ account, caption, media }: PublishInput): Promise<PublishResult> {
    if (media.some((m) => m.kind === 'VIDEO')) {
      // Chunked video upload (INIT/APPEND/FINALIZE) is on the roadmap.
      throw new BadRequestError('Video posts to X are not supported yet — use images or text');
    }
    const mediaIds: string[] = [];
    for (const m of media.slice(0, 4))
      mediaIds.push(await this.uploadImage(account.accessToken, m.url, m.mimeType));
    const { data } = await this.http<{ data: { id: string } }>(`${API}/tweets`, {
      method: 'POST',
      token: account.accessToken,
      body: JSON.stringify({
        text: caption.slice(0, 280),
        ...(mediaIds.length ? { media: { media_ids: mediaIds } } : {}),
      }),
    });
    return { externalPostId: data.id, url: `https://x.com/i/web/status/${data.id}` };
  }

  async fetchPostMetrics(account: AccountCredentials, id: string): Promise<PostMetrics> {
    const m = emptyMetrics();
    const { data } = await this.http<{
      data: {
        public_metrics: {
          like_count: number;
          reply_count: number;
          retweet_count: number;
          quote_count: number;
          bookmark_count?: number;
          impression_count?: number;
        };
      };
    }>(`${API}/tweets/${id}?tweet.fields=public_metrics`, { token: account.accessToken });
    const p = data.public_metrics;
    m.likes = p.like_count;
    m.comments = p.reply_count;
    m.shares = p.retweet_count + p.quote_count;
    m.saves = p.bookmark_count ?? 0;
    m.impressions = m.views = p.impression_count ?? 0;
    return m;
  }

  async fetchAccountMetrics(account: AccountCredentials): Promise<AccountMetrics> {
    const { data } = await this.http<{ data: { public_metrics: { followers_count: number } } }>(
      `${API}/users/${account.externalId}?user.fields=public_metrics`,
      { token: account.accessToken },
    );
    return { followers: data.public_metrics.followers_count };
  }
}
