import { format, formatDistanceToNow, isToday, isTomorrow } from 'date-fns';

export const compact = (n: number) =>
  new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
export const percent = (n: number) => `${(n * 100).toFixed(1)}%`;
export const money = (cents: number) =>
  `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

export const when = (iso: string | null | undefined) => {
  if (!iso) return 'Not scheduled';
  const d = new Date(iso);
  const time = format(d, 'h:mm a');
  if (isToday(d)) return `Today, ${time}`;
  if (isTomorrow(d)) return `Tomorrow, ${time}`;
  return format(d, 'EEE, MMM d · h:mm a');
};
export const ago = (iso: string) => formatDistanceToNow(new Date(iso), { addSuffix: true });
