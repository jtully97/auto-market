'use client';

import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Circle,
  Coins,
  ListChecks,
  Send,
  Sparkles,
} from 'lucide-react';
import Link from 'next/link';
import { PageHeader } from '@/components/shared/page-header';
import { PlatformIcon } from '@/components/shared/platform-icon';
import { StatCard } from '@/components/shared/stat-card';
import { useSession } from '@/components/providers/session';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { useDashboard } from '@/lib/api/resources';
import { when } from '@/lib/format';

const CHECKLIST_LINKS: Record<string, string> = {
  brand: '/settings?tab=brand',
  channels: '/channels',
  post: '/compose',
  ai: '/settings?tab=brand',
  analyst: '/analyst',
};

export default function DashboardPage() {
  const { me } = useSession();
  const { data, isLoading } = useDashboard();
  const done = data?.checklist.filter((c) => c.done).length ?? 0;
  const total = data?.checklist.length ?? 5;

  return (
    <>
      <PageHeader
        title={`Hi ${me.name.split(' ')[0]} 👋`}
        description={
          data
            ? `${data.scheduledThisWeek} posts going out this week. Sit back — we've got it.`
            : 'Loading your week…'
        }
        actions={
          <Button asChild variant="outline">
            <Link href="/studio">
              <Sparkles className="size-4" /> Generate content
            </Link>
          </Button>
        }
      />

      {data && (data.reconnectNeeded > 0 || data.failed > 0) && (
        <Alert variant="destructive" className="mb-6">
          <AlertTriangle className="size-4" />
          <AlertTitle>Needs your attention</AlertTitle>
          <AlertDescription className="flex flex-wrap gap-x-4">
            {data.reconnectNeeded > 0 && (
              <Link href="/channels" className="underline">
                {data.reconnectNeeded} channel(s) need reconnecting
              </Link>
            )}
            {data.failed > 0 && (
              <Link href="/content?status=FAILED" className="underline">
                {data.failed} post(s) failed to publish
              </Link>
            )}
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Scheduled this week"
          value={data?.scheduledThisWeek ?? 0}
          icon={CalendarClock}
          loading={isLoading}
        />
        <StatCard
          label="Awaiting approval"
          value={data?.needsApproval ?? 0}
          icon={ListChecks}
          loading={isLoading}
          hint={
            data?.needsApproval ? (
              <Link href="/content?status=PENDING_APPROVAL" className="underline">
                Review now
              </Link>
            ) : (
              'All clear'
            )
          }
        />
        <StatCard
          label="Published (30 days)"
          value={data?.published30 ?? 0}
          icon={Send}
          loading={isLoading}
        />
        <StatCard
          label="AI credits"
          value={data?.credits.available.toLocaleString() ?? 0}
          icon={Coins}
          loading={isLoading}
          hint={
            <Link href="/settings?tab=billing" className="underline">
              Top up or upgrade
            </Link>
          }
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Up next</CardTitle>
            <CardDescription>The next 7 days across every channel</CardDescription>
            <CardAction>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/calendar">
                  Calendar <ArrowRight className="size-4" />
                </Link>
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent className="space-y-2">
            {isLoading &&
              Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
            {data?.upcoming.length === 0 && (
              <div className="text-muted-foreground rounded-lg border border-dashed p-8 text-center text-sm">
                Nothing scheduled yet.{' '}
                <Link href="/compose" className="text-foreground underline">
                  Create your first post
                </Link>
              </div>
            )}
            {data?.upcoming.map((post) => (
              <Link
                key={post.id}
                href={`/compose?id=${post.id}`}
                className="hover:bg-muted/50 flex items-center gap-3 rounded-lg border p-3 transition-colors"
              >
                {post.media[0] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={post.media[0].url} alt="" className="size-10 rounded-md object-cover" />
                ) : (
                  <div className="bg-muted size-10 rounded-md" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{post.caption || 'Untitled post'}</p>
                  <p className="text-muted-foreground text-xs">{when(post.scheduledAt)}</p>
                </div>
                <div className="flex -space-x-1">
                  {post.targets.map((t) => (
                    <PlatformIcon
                      key={t.id}
                      platform={t.account.platform}
                      size="sm"
                      className="ring-background ring-2"
                    />
                  ))}
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>

        <div className="space-y-6">
          {done < total && (
            <Card>
              <CardHeader>
                <CardTitle>Get set up</CardTitle>
                <CardDescription>
                  {done} of {total} done — then it runs itself
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Progress value={(done / total) * 100} />
                {data?.checklist.map((c) => (
                  <Link
                    key={c.key}
                    href={CHECKLIST_LINKS[c.key] ?? '/dashboard'}
                    className="flex items-center gap-2 text-sm"
                  >
                    {c.done ? (
                      <CheckCircle2 className="size-4 text-emerald-500" />
                    ) : (
                      <Circle className="text-muted-foreground size-4" />
                    )}
                    <span className={c.done ? 'text-muted-foreground line-through' : ''}>
                      {c.label}
                    </span>
                  </Link>
                ))}
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader>
              <CardTitle>Channels</CardTitle>
              <CardAction>
                <Button variant="ghost" size="sm" asChild>
                  <Link href="/channels">Manage</Link>
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent className="space-y-2">
              {data?.accounts.length === 0 && (
                <p className="text-muted-foreground text-sm">No channels connected yet.</p>
              )}
              {data?.accounts.map((a) => (
                <div key={a.id} className="flex items-center gap-2 text-sm">
                  <PlatformIcon platform={a.platform} size="sm" />
                  <span className="flex-1 truncate">{a.name}</span>
                  {a.status !== 'CONNECTED' && (
                    <span className="text-destructive text-xs">Reconnect</span>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
          {data?.nextCampaign && (
            <Card>
              <CardHeader>
                <CardTitle>Next email</CardTitle>
                <CardDescription>{data.nextCampaign.name}</CardDescription>
              </CardHeader>
              <CardContent className="text-muted-foreground text-sm">
                {when(data.nextCampaign.scheduledAt)}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
