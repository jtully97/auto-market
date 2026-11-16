import { PLATFORM_SPECS, type MediaKind, type Platform } from './platforms.js';

export interface ContentIssue {
  platform: Platform;
  severity: 'error' | 'warning';
  message: string;
}

/**
 * Validate one piece of content against a platform's rules. Shared by the
 * composer (live feedback) and the API (authoritative check before scheduling).
 */
export const validateForPlatform = (
  platform: Platform,
  caption: string,
  media: { kind: MediaKind }[],
): ContentIssue[] => {
  const spec = PLATFORM_SPECS[platform];
  const issues: ContentIssue[] = [];
  const err = (message: string) => issues.push({ platform, severity: 'error', message });
  const warn = (message: string) => issues.push({ platform, severity: 'warning', message });

  if (caption.length > spec.captionMaxLength) {
    err(
      `${spec.label} captions are limited to ${spec.captionMaxLength.toLocaleString()} characters (${caption.length.toLocaleString()} now)`,
    );
  }
  if (spec.requiresMedia && media.length === 0)
    err(`${spec.label} needs at least one ${spec.supports.join(' or ').toLowerCase()}`);
  if (media.length > spec.maxMedia)
    err(`${spec.label} allows up to ${spec.maxMedia} media item(s)`);
  for (const kind of new Set(media.map((m) => m.kind))) {
    if (!spec.supports.includes(kind))
      err(`${spec.label} doesn't support ${kind.toLowerCase()} posts`);
  }
  if (platform === 'TIKTOK' && media.some((m) => m.kind === 'VIDEO') && media.length > 1) {
    err('TikTok video posts take a single video');
  }
  if (spec.maxHashtags) {
    const tags = caption.match(/#[\p{L}\p{N}_]+/gu)?.length ?? 0;
    if (tags > spec.maxHashtags) err(`${spec.label} allows up to ${spec.maxHashtags} hashtags`);
  }
  if (!caption.trim() && !media.length) err('Add a caption or media');
  if (platform === 'X' && media.some((m) => m.kind === 'VIDEO'))
    warn('Video to X is not supported yet — it will be skipped');
  return issues;
};
