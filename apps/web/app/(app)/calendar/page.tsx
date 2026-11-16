'use client';

import {
  addDays,
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/shared/page-header';
import { PlatformIcon } from '@/components/shared/platform-icon';
import { Button } from '@/components/ui/button';
import { posts } from '@/lib/api/resources';
import type { Post } from '@/lib/api/types';
import { cn } from '@/lib/utils';

const STATUS_DOT: Record<string, string> = {
  SCHEDULED: 'bg-blue-500',
  PUBLISHED: 'bg-emerald-500',
  FAILED: 'bg-red-500',
  PARTIALLY_PUBLISHED: 'bg-orange-500',
  PENDING_APPROVAL: 'bg-amber-500',
  DRAFT: 'bg-zinc-400',
  PUBLISHING: 'bg-violet-500',
};

export default function CalendarPage() {
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const gridStart = startOfWeek(month);
  const gridEnd = endOfWeek(endOfMonth(month));
  const { data } = posts.useList({
    from: gridStart.toISOString(),
    to: gridEnd.toISOString(),
    pageSize: 200,
  });
  const reschedule = posts.useAction<{ id: string; scheduledAt: Date }>(({ id, scheduledAt }) => ({
    path: `/${id}/schedule`,
    method: 'PATCH',
    body: { scheduledAt },
  }));
  const [dragging, setDragging] = useState<Post | null>(null);

  const days: Date[] = [];
  for (let d = gridStart; d <= gridEnd; d = addDays(d, 1)) days.push(d);
  const postsOn = (day: Date) =>
    (data?.items ?? []).filter((p) => p.scheduledAt && isSameDay(new Date(p.scheduledAt), day));

  const onDrop = (day: Date) => {
    if (!dragging?.scheduledAt) return;
    const old = new Date(dragging.scheduledAt);
    const next = new Date(day);
    next.setHours(old.getHours(), old.getMinutes(), 0, 0);
    setDragging(null);
    if (isSameDay(old, next)) return;
    reschedule.mutate(
      { id: dragging.id, scheduledAt: next },
      { onSuccess: () => toast.success(`Moved to ${format(next, 'EEE MMM d, h:mm a')}`) },
    );
  };

  return (
    <>
      <PageHeader
        title="Calendar"
        description="Drag a post to another day to reschedule it."
        actions={
          <>
            <Button
              variant="outline"
              size="icon"
              aria-label="Previous month"
              onClick={() => setMonth((m) => addMonths(m, -1))}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Button variant="outline" onClick={() => setMonth(startOfMonth(new Date()))}>
              Today
            </Button>
            <Button
              variant="outline"
              size="icon"
              aria-label="Next month"
              onClick={() => setMonth((m) => addMonths(m, 1))}
            >
              <ChevronRight className="size-4" />
            </Button>
            <span className="w-36 text-center font-medium">{format(month, 'MMMM yyyy')}</span>
          </>
        }
      />
      <div className="overflow-hidden rounded-xl border">
        <div className="bg-muted/50 text-muted-foreground grid grid-cols-7 border-b text-xs font-medium">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
            <div key={d} className="px-2 py-2">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((day) => {
            const list = postsOn(day);
            const past = day < addDays(new Date(), -1);
            return (
              <div
                key={day.toISOString()}
                onDragOver={(e) => !past && e.preventDefault()}
                onDrop={() => onDrop(day)}
                className={cn(
                  'group min-h-28 border-r border-b p-1.5 last:border-r-0 [&:nth-child(7n)]:border-r-0',
                  !isSameMonth(day, month) && 'bg-muted/30 text-muted-foreground',
                )}
              >
                <div className="mb-1 flex items-center justify-between">
                  <span
                    className={cn(
                      'flex size-6 items-center justify-center rounded-full text-xs',
                      isSameDay(day, new Date()) &&
                        'bg-primary text-primary-foreground font-semibold',
                    )}
                  >
                    {format(day, 'd')}
                  </span>
                  {!past && (
                    <Link
                      href="/compose"
                      aria-label="New post"
                      className="text-muted-foreground hover:text-foreground opacity-0 transition group-hover:opacity-100"
                    >
                      <Plus className="size-3.5" />
                    </Link>
                  )}
                </div>
                <div className="space-y-1">
                  {list.slice(0, 4).map((p) => (
                    <Link
                      key={p.id}
                      href={`/compose?id=${p.id}`}
                      draggable={['SCHEDULED', 'DRAFT', 'PENDING_APPROVAL'].includes(p.status)}
                      onDragStart={() => setDragging(p)}
                      className="bg-background hover:bg-muted flex items-center gap-1 rounded-md border px-1.5 py-1 text-[11px] shadow-xs"
                    >
                      <span
                        className={cn('size-1.5 shrink-0 rounded-full', STATUS_DOT[p.status])}
                      />
                      <span className="tabular-nums">
                        {format(new Date(p.scheduledAt!), 'h:mma').toLowerCase()}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{p.caption || 'Untitled'}</span>
                      <span className="flex -space-x-1">
                        {p.targets.slice(0, 3).map((t) => (
                          <PlatformIcon
                            key={t.id}
                            platform={t.account.platform}
                            size="sm"
                            className="size-3.5 text-[6px]"
                          />
                        ))}
                      </span>
                    </Link>
                  ))}
                  {list.length > 4 && (
                    <div className="text-muted-foreground px-1 text-[11px]">
                      +{list.length - 4} more
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
