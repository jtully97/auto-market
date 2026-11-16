import { Coins } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Shows the credit price of an action before the user commits — no surprise charges. */
export function CreditCost({ credits, className }: { credits: number; className?: string }) {
  return (
    <span
      className={cn(
        'text-muted-foreground inline-flex items-center gap-1 text-xs tabular-nums',
        className,
      )}
    >
      <Coins className="size-3.5" />
      {credits.toLocaleString()} credit{credits === 1 ? '' : 's'}
    </span>
  );
}
