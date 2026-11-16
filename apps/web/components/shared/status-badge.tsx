import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const STYLES: Record<string, { label: string; className: string }> = {
  DRAFT: { label: 'Draft', className: 'bg-muted text-muted-foreground' },
  PENDING_APPROVAL: {
    label: 'Needs approval',
    className: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  },
  SCHEDULED: { label: 'Scheduled', className: 'bg-blue-500/15 text-blue-700 dark:text-blue-400' },
  PUBLISHING: {
    label: 'Publishing',
    className: 'bg-violet-500/15 text-violet-700 dark:text-violet-400',
  },
  SENDING: { label: 'Sending', className: 'bg-violet-500/15 text-violet-700 dark:text-violet-400' },
  PUBLISHED: {
    label: 'Published',
    className: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  },
  SENT: { label: 'Sent', className: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' },
  PARTIALLY_PUBLISHED: {
    label: 'Partly published',
    className: 'bg-orange-500/15 text-orange-700 dark:text-orange-400',
  },
  FAILED: { label: 'Failed', className: 'bg-red-500/15 text-red-700 dark:text-red-400' },
  CANCELED: { label: 'Canceled', className: 'bg-muted text-muted-foreground' },
  RUNNING: {
    label: 'Generating…',
    className: 'bg-violet-500/15 text-violet-700 dark:text-violet-400',
  },
  SUCCEEDED: {
    label: 'Ready',
    className: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  },
  CONNECTED: {
    label: 'Connected',
    className: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  },
  EXPIRED: { label: 'Reconnect', className: 'bg-red-500/15 text-red-700 dark:text-red-400' },
  SUBSCRIBED: {
    label: 'Subscribed',
    className: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  },
  UNSUBSCRIBED: { label: 'Unsubscribed', className: 'bg-muted text-muted-foreground' },
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const s = STYLES[status] ?? {
    label: status.toLowerCase().replace(/_/g, ' '),
    className: 'bg-muted',
  };
  return (
    <Badge variant="secondary" className={cn('border-0 font-medium', s.className, className)}>
      {s.label}
    </Badge>
  );
}
