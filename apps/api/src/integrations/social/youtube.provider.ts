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

const API = 'https://www.googleapis.com/youtube/v3';

export class YouTubeProvider extends OAuth2Provider {
  readonly platform = 'YOUTUBE' as const;
  protected readonly oauth: OAuthConfig = {
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    scopes: [
      'https://www.googleapis.com/auth/youtube.upload',
      'https://www.googleapis.com/auth/youtube.readonly',
    ],
    pkce: true,
    extraAuthorizeParams: {
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'true',
    },
  };

  async connect(code: string, verifier: string) {
    const tokens = await this.exchangeCode(code, verifier);
    const res = await this.http<{
      items?: {
        id: string;
        snippet: { title: string; customUrl?: string; thumbnails?: { default?: { url: string } } };
      }[];
    }>(`${API}/channels?part=snippet&mine=true`, { token: tokens.accessToken });
    const profiles = (res.items ?? []).map((c) => ({
      externalId: c.id,
      name: c.snippet.title,
      handle: c.snippet.customUrl,
      avatarUrl: c.snippet.thumbnails?.default?.url,
    }));
    if (!profiles.length) throw new BadRequestError('This Google account has no YouTube channel');
    return { tokens, profiles };
  }

  /** Resumable upload: create a session with metadata, then PUT the bytes. */
  async publish({ account, caption, media, options }: PublishInput): Promise<PublishResult> {
    const video = media.find((m) => m.kind === 'VIDEO');
    if (!video) throw new BadRequestError('YouTube posts need a video');
    const [firstLine, ...rest] = caption.split('\n');
    const title = ((options.title as string) ?? firstLine ?? 'New video').slice(0, 100);
    const metadata = {
      snippet: { title, description: caption.slice(0, 5000) || rest.join('\n'), categoryId: '22' },
      status: {
        privacyStatus: (options.privacyStatus as string) ?? 'public',
        selfDeclaredMadeForKids: Boolean(options.madeForKids),
      },
    };
    const bytes = await this.download(video.url);
    const init = await fetch(
      'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${account.accessToken}`,
          'Content-Type': 'application/json; charset=UTF-8',
          'X-Upload-Content-Type': video.mimeType,
          'X-Upload-Content-Length': String(bytes.length),
        },
        body: JSON.stringify(metadata),
      },
    );
    const location = init.headers.get('location');
    if (!init.ok || !location)
      throw new ExternalServiceError('YOUTUBE', `Upload init failed (${init.status})`);
    const upload = await fetch(location, {
      method: 'PUT',
      headers: { 'Content-Type': video.mimeType, 'Content-Length': String(bytes.length) },
      body: new Uint8Array(bytes),
    });
    if (!upload.ok) throw new ExternalServiceError('YOUTUBE', `Upload failed (${upload.status})`);
    const { id } = (await upload.json()) as { id: string };
    return { externalPostId: id, url: `https://www.youtube.com/watch?v=${id}` };
  }

  async fetchPostMetrics(account: AccountCredentials, videoId: string): Promise<PostMetrics> {
    const m = emptyMetrics();
    const res = await this.http<{ items?: { statistics: Record<string, string> }[] }>(
      `${API}/videos?part=statistics&id=${videoId}`,
      { token: account.accessToken },
    );
    const s = res.items?.[0]?.statistics;
    if (s) {
      m.views = m.impressions = Number(s.viewCount ?? 0);
      m.likes = Number(s.likeCount ?? 0);
      m.comments = Number(s.commentCount ?? 0);
      m.saves = Number(s.favoriteCount ?? 0);
    }
    return m;
  }

  async fetchAccountMetrics(account: AccountCredentials): Promise<AccountMetrics> {
    const res = await this.http<{ items?: { statistics: { subscriberCount?: string } }[] }>(
      `${API}/channels?part=statistics&id=${account.externalId}`,
      { token: account.accessToken },
    );
    return { followers: Number(res.items?.[0]?.statistics.subscriberCount ?? 0) };
  }
}
