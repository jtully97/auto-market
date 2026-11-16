export const PLATFORMS = ['INSTAGRAM', 'FACEBOOK', 'TIKTOK', 'YOUTUBE', 'LINKEDIN', 'X'] as const;
export type Platform = (typeof PLATFORMS)[number];

export type MediaKind = 'IMAGE' | 'VIDEO';

export interface PlatformSpec {
  label: string;
  captionMaxLength: number;
  maxMedia: number;
  supports: MediaKind[];
  requiresMedia: boolean;
  /** Recommended aspect ratios, first is preferred. */
  aspectRatios: string[];
  maxHashtags?: number;
  color: string;
}

export const PLATFORM_SPECS: Record<Platform, PlatformSpec> = {
  INSTAGRAM: {
    label: 'Instagram',
    captionMaxLength: 2200,
    maxMedia: 10,
    supports: ['IMAGE', 'VIDEO'],
    requiresMedia: true,
    aspectRatios: ['4:5', '1:1', '9:16'],
    maxHashtags: 30,
    color: '#E1306C',
  },
  FACEBOOK: {
    label: 'Facebook',
    captionMaxLength: 63206,
    maxMedia: 10,
    supports: ['IMAGE', 'VIDEO'],
    requiresMedia: false,
    aspectRatios: ['1:1', '4:5', '16:9'],
    color: '#1877F2',
  },
  TIKTOK: {
    label: 'TikTok',
    captionMaxLength: 2200,
    maxMedia: 1,
    supports: ['VIDEO', 'IMAGE'],
    requiresMedia: true,
    aspectRatios: ['9:16'],
    color: '#000000',
  },
  YOUTUBE: {
    label: 'YouTube',
    captionMaxLength: 5000,
    maxMedia: 1,
    supports: ['VIDEO'],
    requiresMedia: true,
    aspectRatios: ['16:9', '9:16'],
    color: '#FF0000',
  },
  LINKEDIN: {
    label: 'LinkedIn',
    captionMaxLength: 3000,
    maxMedia: 9,
    supports: ['IMAGE', 'VIDEO'],
    requiresMedia: false,
    aspectRatios: ['1:1', '1.91:1', '4:5'],
    color: '#0A66C2',
  },
  X: {
    label: 'X',
    captionMaxLength: 280,
    maxMedia: 4,
    supports: ['IMAGE', 'VIDEO'],
    requiresMedia: false,
    aspectRatios: ['16:9', '1:1'],
    color: '#111111',
  },
};
