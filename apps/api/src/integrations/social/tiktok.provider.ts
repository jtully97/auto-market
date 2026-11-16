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

const API = 'https://open.tiktokapis.com/v2';

interface TikTokEnvelope<T> {
  data: T;
  error: { code: string; message: string };
}

/**
 * TikTok Content Posting API. Note: until your app passes TikTok's audit,
 * posts are restricted to SELF_ONLY visibility, and PULL_FROM_URL requires the
 * media domain (your GCS bucket / CDN) to be verified in the TikTok dev portal.
 */
export class TikTokProvider extends OAuth2Provider {
  readonly platform = 'TIKTOK' as const;
  protected readonly oauth: OAuthConfig = {
    authorizeUrl: 'https://www.tiktok.com/v2/auth/authorize/',
    tokenUrl: `${API}/oauth/token/`,
    clientId: env.TIKTOK_CLIENT_KEY,
    clientSecret: env.TIKTOK_CLIENT_SECRET,
    clientIdParam: 'client_key',
    scopes: ['user.info.basic', 'user.info.stats', 'video.publish', 'video.upload', 'video.list'],
    scopeSeparator: ',',
    pkce: true,
  };

  private async api<T>(path: string, token: string, body?: unknown): Promise<T> {
    const res = await this.http<TikTokEnvelope<T>>(`${API}/${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      token,
      headers: { 'Content-Type': 'application/json; charset=UTF-8' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (res.error && res.error.code !== 'ok')
      throw new ExternalServiceError('TIKTOK', res.error.message);
    return res.data;
  }

  async connect(code: string, verifier: string) {
    const tokens = await this.exchangeCode(code, verifier);
    const { user } = await this.api<{
      user: { open_id: string; display_name: string; username?: string; avatar_url?: string };
    }>('user/info/?fields=open_id,display_name,username,avatar_url', tokens.accessToken);
    return {
      tokens,
      profiles: [
        {
          externalId: user.open_id,
          name: user.display_name,
          handle: user.username,
          avatarUrl: user.avatar_url,
        },
      ],
    };
  }

  async publish({ account, caption, media, options }: PublishInput): Promise<PublishResult> {
    const token = account.accessToken;
    const creator = await this.api<{ privacy_level_options: string[] }>(
      'post/publish/creator_info/query/',
      token,
      {},
    );
    const wanted = (options.privacyLevel as string) ?? 'PUBLIC_TO_EVERYONE';
    const privacy = creator.privacy_level_options.includes(wanted)
      ? wanted
      : creator.privacy_level_options[0];

    const video = media.find((m) => m.kind === 'VIDEO');
    let publishId: string;
    if (video) {
      ({ publish_id: publishId } = await this.api<{ publish_id: string }>(
        'post/publish/video/init/',
        token,
        {
          post_info: {
            title: caption.slice(0, 2200),
            privacy_level: privacy,
            disable_comment: false,
          },
          source_info: { source: 'PULL_FROM_URL', video_url: video.url },
        },
      ));
    } else if (media.length) {
      ({ publish_id: publishId } = await this.api<{ publish_id: string }>(
        'post/publish/content/init/',
        token,
        {
          media_type: 'PHOTO',
          post_mode: 'DIRECT_POST',
          post_info: { title: caption.slice(0, 90), description: caption, privacy_level: privacy },
          source_info: {
            source: 'PULL_FROM_URL',
            photo_images: media.map((m) => m.url),
            photo_cover_index: 0,
          },
        },
      ));
    } else {
      throw new BadRequestError('TikTok posts need a video or photos');
    }

    for (let i = 0; i < 60; i++) {
      const status = await this.api<{
        status: string;
        fail_reason?: string;
        publicaly_available_post_id?: string[];
      }>('post/publish/status/fetch/', token, { publish_id: publishId });
      if (status.status === 'PUBLISH_COMPLETE') {
        const postId = status.publicaly_available_post_id?.[0] ?? publishId;
        return { externalPostId: postId, url: `https://www.tiktok.com/video/${postId}` };
      }
      if (status.status === 'FAILED')
        throw new ExternalServiceError('TIKTOK', status.fail_reason ?? 'Publish failed');
      await this.sleep(5000);
    }
    // Still processing — TikTok will finish asynchronously; record the publish id.
    return { externalPostId: publishId };
  }

  async fetchPostMetrics(account: AccountCredentials, videoId: string): Promise<PostMetrics> {
    const m = emptyMetrics();
    const data = await this.api<{
      videos: {
        like_count?: number;
        comment_count?: number;
        share_count?: number;
        view_count?: number;
      }[];
    }>(
      'video/query/?fields=id,like_count,comment_count,share_count,view_count',
      account.accessToken,
      { filters: { video_ids: [videoId] } },
    );
    const v = data.videos[0];
    if (v) {
      m.likes = v.like_count ?? 0;
      m.comments = v.comment_count ?? 0;
      m.shares = v.share_count ?? 0;
      m.views = m.impressions = v.view_count ?? 0;
    }
    return m;
  }

  async fetchAccountMetrics(account: AccountCredentials): Promise<AccountMetrics> {
    const { user } = await this.api<{ user: { follower_count?: number } }>(
      'user/info/?fields=follower_count',
      account.accessToken,
    );
    return { followers: user.follower_count ?? 0 };
  }
}
