'use client';

import { PLATFORM_SPECS, type Platform } from '@automarket/shared';
import { format } from 'date-fns';
import { BarChart3, Brain, Eye, Heart, MousePointerClick, Users } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { EmptyState } from '@/components/shared/empty-state';
import { PageHeader } from '@/components/shared/page-header';
import { PlatformIcon } from '@/components/shared/platform-icon';
import { StatCard } from '@/components/shared/stat-card';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useAnalytics } from '@/lib/api/resources';
import { compact, percent } from '@/lib/format';
import { useActiveBrand } from '@/lib/use-brand';

const tooltipStyle = {
  background: 'var(--popover)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  fontSize: 12,
  color: 'var(--popover-foreground)',
};

export default function AnalyticsPage() {
  const [days, setDays] = useState('30');
  const { brand } = useActiveBrand();
  const { data, isLoading } = useAnalytics({ days, brandId: brand?.id });
  const t = data?.totals;

  return (
    <>
      <PageHeader
        title="Analytics"
        description="How your content is performing and what to do more of."
        actions={
          <>
            <Select value={days} onValueChange={setDays}>
              <SelectTrigger className="w-36" aria-label="Date range">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Last 7 days</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
                <SelectItem value="90">Last 90 days</SelectItem>
                <SelectItem value="365">Last 12 months</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" asChild>
              <Link href="/analyst">
                <Brain className="size-4" /> Ask the AI analyst
              </Link>
            </Button>
          </>
        }
      />
      {data && data.range.days < Number(days) && (
        <p className="text-muted-foreground mb-4 text-sm">
          Showing the last {data.range.days} days.{' '}
          <Link href="/settings?tab=billing" className="underline">
            Upgrade to Business
          </Link>{' '}
          for full history.
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Impressions"
          value={compact(t?.impressions ?? 0)}
          icon={Eye}
          loading={isLoading}
          hint={`${t?.posts ?? 0} posts`}
        />
        <StatCard
          label="Engagements"
          value={compact(t?.engagements ?? 0)}
          icon={Heart}
          loading={isLoading}
        />
        <StatCard
          label="Avg. engagement rate"
          value={percent(t?.engagementRate ?? 0)}
          icon={MousePointerClick}
          loading={isLoading}
        />
        <StatCard
          label="Followers"
          value={compact(t?.followers ?? 0)}
          icon={Users}
          loading={isLoading}
          hint={
            t
              ? `${t.followerGrowth >= 0 ? '+' : ''}${compact(t.followerGrowth)} this period`
              : undefined
          }
        />
      </div>

      {data && data.totals.posts === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon={BarChart3}
            title="No published posts in this period"
            description="Metrics sync every few hours after your posts go live."
          />
        </div>
      ) : (
        <>
          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Reach & engagement</CardTitle>
              <CardDescription>By publish date</CardDescription>
            </CardHeader>
            <CardContent className="h-72">
              <ResponsiveContainer>
                <AreaChart data={data?.timeseries ?? []}>
                  <defs>
                    <linearGradient id="imp" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="eng" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--chart-2)" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="var(--chart-2)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(d: string) => format(new Date(d), 'MMM d')}
                    fontSize={12}
                    stroke="var(--muted-foreground)"
                  />
                  <YAxis
                    tickFormatter={compact}
                    fontSize={12}
                    stroke="var(--muted-foreground)"
                    width={40}
                  />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Area
                    type="monotone"
                    dataKey="impressions"
                    name="Impressions"
                    stroke="var(--chart-1)"
                    fill="url(#imp)"
                    strokeWidth={2}
                  />
                  <Area
                    type="monotone"
                    dataKey="engagements"
                    name="Engagements"
                    stroke="var(--chart-2)"
                    fill="url(#eng)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <div className="mt-6 grid gap-6 lg:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">By platform</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {data?.byPlatform.map((p) => (
                  <div key={p.key} className="flex items-center gap-3 text-sm">
                    <PlatformIcon platform={p.key as Platform} size="sm" />
                    <span className="flex-1">{PLATFORM_SPECS[p.key as Platform].label}</span>
                    <span className="text-muted-foreground tabular-nums">{p.posts} posts</span>
                    <span className="w-14 text-right font-medium tabular-nums">
                      {percent(p.engagementRate)}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">By format</CardTitle>
                <CardDescription>Avg. engagement rate</CardDescription>
              </CardHeader>
              <CardContent className="h-48">
                <ResponsiveContainer>
                  <BarChart data={data?.byFormat ?? []}>
                    <XAxis dataKey="key" fontSize={12} stroke="var(--muted-foreground)" />
                    <YAxis
                      tickFormatter={percent}
                      fontSize={12}
                      stroke="var(--muted-foreground)"
                      width={44}
                    />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v) => percent(Number(v))} />
                    <Bar
                      dataKey="engagementRate"
                      name="Engagement"
                      fill="var(--chart-3)"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Best times to post</CardTitle>
                <CardDescription>Your top slots by engagement</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {data?.bestTimes.length === 0 && (
                  <p className="text-muted-foreground">
                    Post a bit more and we&apos;ll find your best slots.
                  </p>
                )}
                {data?.bestTimes.map((s, i) => (
                  <div key={s.key} className="flex justify-between">
                    <span>
                      {i + 1}. {s.key}
                    </span>
                    <span className="font-medium tabular-nums">{percent(s.engagementRate)}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Top posts</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Post</TableHead>
                    <TableHead className="text-right">Impressions</TableHead>
                    <TableHead className="text-right">Likes</TableHead>
                    <TableHead className="text-right">Comments</TableHead>
                    <TableHead className="text-right">Shares</TableHead>
                    <TableHead className="text-right">Eng. rate</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data?.topPosts.map((p) => (
                    <TableRow key={p.targetId}>
                      <TableCell className="max-w-md">
                        <div className="flex items-center gap-2">
                          <PlatformIcon platform={p.platform} size="sm" />
                          {p.url ? (
                            <a
                              href={p.url}
                              target="_blank"
                              rel="noreferrer"
                              className="truncate hover:underline"
                            >
                              {p.caption || '(no caption)'}
                            </a>
                          ) : (
                            <span className="truncate">{p.caption}</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {compact(p.impressions)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{compact(p.likes)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {compact(p.comments)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{compact(p.shares)}</TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {percent(p.engagementRate)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </>
  );
}
