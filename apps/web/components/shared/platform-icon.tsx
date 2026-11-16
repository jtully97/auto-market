import { PLATFORM_SPECS, type Platform } from '@automarket/shared';
import { cn } from '@/lib/utils';

/** Brand-colored platform glyph (letter mark keeps us free of third-party logo assets). */
const GLYPH: Record<Platform, string> = {
  INSTAGRAM: 'IG',
  FACEBOOK: 'f',
  TIKTOK: 'TT',
  YOUTUBE: '▶',
  LINKEDIN: 'in',
  X: '𝕏',
};

export function PlatformIcon({
  platform,
  className,
  size = 'md',
}: {
  platform: Platform;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const spec = PLATFORM_SPECS[platform];
  return (
    <span
      title={spec.label}
      aria-label={spec.label}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-md font-semibold text-white',
        size === 'sm' && 'size-5 text-[9px]',
        size === 'md' && 'size-7 text-[11px]',
        size === 'lg' && 'size-10 text-sm',
        className,
      )}
      style={{ background: spec.color }}
    >
      {GLYPH[platform]}
    </span>
  );
}
