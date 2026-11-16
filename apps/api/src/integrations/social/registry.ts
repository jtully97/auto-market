import type { Platform } from '@automarket/shared';
import { LinkedInProvider } from './linkedin.provider.js';
import { FacebookProvider, InstagramProvider } from './meta.provider.js';
import type { SocialProvider } from './provider.js';
import { TikTokProvider } from './tiktok.provider.js';
import { XProvider } from './x.provider.js';
import { YouTubeProvider } from './youtube.provider.js';

/** Strategy registry — add a platform by implementing SocialProvider and registering it here. */
const providers: Record<Platform, SocialProvider> = {
  INSTAGRAM: new InstagramProvider(),
  FACEBOOK: new FacebookProvider(),
  TIKTOK: new TikTokProvider(),
  YOUTUBE: new YouTubeProvider(),
  LINKEDIN: new LinkedInProvider(),
  X: new XProvider(),
};

export const getProvider = (platform: Platform): SocialProvider => providers[platform];
export const listProviders = () => Object.values(providers);
