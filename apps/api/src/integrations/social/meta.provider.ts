import { env } from '../../config/env.js';
import { BadRequestError, ExternalServiceError } from '../../core/errors.js';
import {
  OAuth2Provider,
  emptyMetrics,
  type AccountCredentials,
  type AccountMetrics,
  type ConnectedProfile,
  type OAuthConfig,
  type OAuthTokens,
  type PostMetrics,
  type PublishInput,
  type PublishResult,
} from './provider.js';

const GRAPH = `https://graph.facebook.com/${process.env.META_GRAPH_VERSION ?? 'v24.0'}`;

interface PageInfo {
  id: string;
  name: string;
  access_token: string;
  picture?: { data?: { url?: string } };
  instagram_business_account?: {
    id: string;
    username?: string;
    profile_picture_url?: string;
    name?: string;
  };
}

/** Shared Meta login: one OAuth app powers Facebook Pages and Instagram business accounts. */
abstract class MetaProvider extends OAuth2Provider {
  protected abstract readonly extraScopes: string[];

  protected get oauth(): OAuthConfig {
    return {
      authorizeUrl: `https://www.facebook.com/${process.env.META_GRAPH_VERSION ?? 'v24.0'}/dialog/oauth`,
      tokenUrl: `${GRAPH}/oauth/access_token`,
      clientId: env.META_APP_ID,
      clientSecret: env.META_APP_SECRET,
      scopes: [
        'pages_show_list',
        'pages_read_engagement',
        'business_management',
        ...this.extraScopes,
      ],
      scopeSeparator: ',',
    };
  }

  protected graph<T>(path: string, token: string, init: RequestInit = {}) {
    const sep = path.includes('?') ? '&' : '?';
    return this.http<T>(`${GRAPH}/${path}${sep}access_token=${encodeURIComponent(token)}`, init);
  }

  protected async longLivedToken(shortLived: string): Promise<OAuthTokens> {
    const data = await this.http<{ access_token: string; expires_in?: number }>(
      `${GRAPH}/oauth/access_token?grant_type=fb_exchange_token&client_id=${env.META_APP_ID}&client_secret=${env.META_APP_SECRET}&fb_exchange_token=${shortLived}`,
    );
    return {
      accessToken: data.access_token,
      expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : undefined,
      scopes: this.oauth.scopes,
    };
  }

  protected async pages(userToken: string): Promise<PageInfo[]> {
    const res = await this.graph<{ data: PageInfo[] }>(
      'me/accounts?fields=id,name,access_token,picture{url},instagram_business_account{id,username,name,profile_picture_url}&limit=100',
      userToken,
    );
    return res.data;
  }

  /** Page tokens derived from a long-lived user token do not expire. */
  protected pageTokens(page: PageInfo): OAuthTokens {
    return { accessToken: page.access_token, scopes: this.oauth.scopes };
  }

  override refresh(): Promise<OAuthTokens> {
    throw new BadRequestError(
      'Meta page tokens do not need refreshing — reconnect if access was revoked',
    );
  }
}

export class FacebookProvider extends MetaProvider {
  readonly platform = 'FACEBOOK' as const;
  protected readonly extraScopes = ['pages_manage_posts', 'read_insights'];

  async connect(code: string, verifier: string) {
    const short = await this.exchangeCode(code, verifier);
    const tokens = await this.longLivedToken(short.accessToken);
    const profiles: ConnectedProfile[] = (await this.pages(tokens.accessToken)).map((p) => ({
      externalId: p.id,
      name: p.name,
      avatarUrl: p.picture?.data?.url,
      tokens: this.pageTokens(p),
    }));
    return { tokens, profiles };
  }

  async publish({ account, caption, media }: PublishInput): Promise<PublishResult> {
    const page = account.externalId;
    const token = account.accessToken;
    const form = (o: Record<string, string>) => JSON.stringify(o);
    let id: string;
    const video = media.find((m) => m.kind === 'VIDEO');
    if (video) {
      ({ id } = await this.graph<{ id: string }>(`${page}/videos`, token, {
        method: 'POST',
        body: form({ file_url: video.url, description: caption }),
      }));
    } else if (media.length === 1) {
      const res = await this.graph<{ id: string; post_id?: string }>(`${page}/photos`, token, {
        method: 'POST',
        body: form({ url: media[0]!.url, caption }),
      });
      id = res.post_id ?? res.id;
    } else if (media.length > 1) {
      const attached = [];
      for (const m of media) {
        const photo = await this.graph<{ id: string }>(`${page}/photos`, token, {
          method: 'POST',
          body: form({ url: m.url, published: 'false' }),
        });
        attached.push({ media_fbid: photo.id });
      }
      ({ id } = await this.graph<{ id: string }>(`${page}/feed`, token, {
        method: 'POST',
        body: JSON.stringify({ message: caption, attached_media: attached }),
      }));
    } else {
      ({ id } = await this.graph<{ id: string }>(`${page}/feed`, token, {
        method: 'POST',
        body: form({ message: caption }),
      }));
    }
    return { externalPostId: id, url: `https://www.facebook.com/${id}` };
  }

  async fetchPostMetrics(account: AccountCredentials, postId: string): Promise<PostMetrics> {
    const m = emptyMetrics();
    const post = await this.graph<{
      reactions?: { summary?: { total_count?: number } };
      comments?: { summary?: { total_count?: number } };
      shares?: { count?: number };
    }>(
      `${postId}?fields=reactions.summary(true).limit(0),comments.summary(true).limit(0),shares`,
      account.accessToken,
    );
    m.likes = post.reactions?.summary?.total_count ?? 0;
    m.comments = post.comments?.summary?.total_count ?? 0;
    m.shares = post.shares?.count ?? 0;
    try {
      const insights = await this.graph<{ data: { name: string; values: { value: number }[] }[] }>(
        `${postId}/insights?metric=post_impressions,post_impressions_unique,post_clicks`,
        account.accessToken,
      );
      for (const metric of insights.data) {
        const value = metric.values[0]?.value ?? 0;
        if (metric.name === 'post_impressions') m.impressions = value;
        if (metric.name === 'post_impressions_unique') m.reach = value;
        if (metric.name === 'post_clicks') m.clicks = value;
      }
    } catch {
      /* insights need read_insights + page age; engagement counts are still useful */
    }
    return m;
  }

  async fetchAccountMetrics(account: AccountCredentials): Promise<AccountMetrics> {
    const page = await this.graph<{ followers_count?: number; fan_count?: number }>(
      `${account.externalId}?fields=followers_count,fan_count`,
      account.accessToken,
    );
    return { followers: page.followers_count ?? page.fan_count ?? 0 };
  }
}

export class InstagramProvider extends MetaProvider {
  readonly platform = 'INSTAGRAM' as const;
  protected readonly extraScopes = [
    'instagram_basic',
    'instagram_content_publish',
    'instagram_manage_insights',
  ];

  async connect(code: string, verifier: string) {
    const short = await this.exchangeCode(code, verifier);
    const tokens = await this.longLivedToken(short.accessToken);
    const profiles: ConnectedProfile[] = (await this.pages(tokens.accessToken))
      .filter((p) => p.instagram_business_account)
      .map((p) => ({
        externalId: p.instagram_business_account!.id,
        name:
          p.instagram_business_account!.name ?? p.instagram_business_account!.username ?? p.name,
        handle: p.instagram_business_account!.username,
        avatarUrl: p.instagram_business_account!.profile_picture_url,
        tokens: this.pageTokens(p),
        metadata: { pageId: p.id },
      }));
    if (!profiles.length) {
      throw new BadRequestError(
        'No Instagram business or creator account is linked to your Facebook Pages',
      );
    }
    return { tokens, profiles };
  }

  private async waitForContainer(id: string, token: string) {
    for (let i = 0; i < 60; i++) {
      const { status_code } = await this.graph<{ status_code: string }>(
        `${id}?fields=status_code`,
        token,
      );
      if (status_code === 'FINISHED') return;
      if (status_code === 'ERROR' || status_code === 'EXPIRED') {
        throw new ExternalServiceError(
          'INSTAGRAM',
          `Media processing ${status_code.toLowerCase()}`,
        );
      }
      await this.sleep(5000);
    }
    throw new ExternalServiceError('INSTAGRAM', 'Media processing timed out');
  }

  private container(user: string, token: string, body: Record<string, unknown>) {
    return this.graph<{ id: string }>(`${user}/media`, token, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async publish({ account, caption, media, options }: PublishInput): Promise<PublishResult> {
    const user = account.externalId;
    const token = account.accessToken;
    if (!media.length) throw new BadRequestError('Instagram posts need an image or video');

    const itemBody = (m: (typeof media)[number], carousel: boolean) =>
      m.kind === 'VIDEO'
        ? {
            media_type: carousel ? 'VIDEO' : 'REELS',
            video_url: m.url,
            ...(carousel ? { is_carousel_item: true } : {}),
          }
        : { image_url: m.url, ...(carousel ? { is_carousel_item: true } : {}) };

    let creationId: string;
    if (media.length === 1) {
      const body: Record<string, unknown> = { ...itemBody(media[0]!, false), caption };
      if (options.story) body.media_type = 'STORIES';
      ({ id: creationId } = await this.container(user, token, body));
    } else {
      const children: string[] = [];
      for (const m of media.slice(0, 10)) {
        const { id } = await this.container(user, token, itemBody(m, true));
        if (m.kind === 'VIDEO') await this.waitForContainer(id, token);
        children.push(id);
      }
      ({ id: creationId } = await this.container(user, token, {
        media_type: 'CAROUSEL',
        children,
        caption,
      }));
    }
    await this.waitForContainer(creationId, token);
    const { id } = await this.graph<{ id: string }>(`${user}/media_publish`, token, {
      method: 'POST',
      body: JSON.stringify({ creation_id: creationId }),
    });
    const { permalink } = await this.graph<{ permalink?: string }>(`${id}?fields=permalink`, token);
    return { externalPostId: id, url: permalink };
  }

  async fetchPostMetrics(account: AccountCredentials, mediaId: string): Promise<PostMetrics> {
    const m = emptyMetrics();
    const base = await this.graph<{ like_count?: number; comments_count?: number }>(
      `${mediaId}?fields=like_count,comments_count`,
      account.accessToken,
    );
    m.likes = base.like_count ?? 0;
    m.comments = base.comments_count ?? 0;
    try {
      const insights = await this.graph<{
        data: { name: string; values?: { value: number }[]; total_value?: { value: number } }[];
      }>(`${mediaId}/insights?metric=reach,views,saved,shares`, account.accessToken);
      for (const metric of insights.data) {
        const value = metric.total_value?.value ?? metric.values?.[0]?.value ?? 0;
        if (metric.name === 'reach') m.reach = value;
        if (metric.name === 'views') m.views = m.impressions = value;
        if (metric.name === 'saved') m.saves = value;
        if (metric.name === 'shares') m.shares = value;
      }
    } catch {
      /* insights unavailable for some media types */
    }
    return m;
  }

  async fetchAccountMetrics(account: AccountCredentials): Promise<AccountMetrics> {
    const data = await this.graph<{ followers_count?: number }>(
      `${account.externalId}?fields=followers_count`,
      account.accessToken,
    );
    return { followers: data.followers_count ?? 0 };
  }
}
