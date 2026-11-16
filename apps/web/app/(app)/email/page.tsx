'use client';

import { Mail, Plus, Users } from 'lucide-react';
import Link from 'next/link';
import { EmptyState } from '@/components/shared/empty-state';
import { PageHeader } from '@/components/shared/page-header';
import { StatusBadge } from '@/components/shared/status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { campaigns } from '@/lib/api/resources';
import { percent, when } from '@/lib/format';

export default function CampaignsPage() {
  const { data, isLoading } = campaigns.useList({ pageSize: 50 });
  return (
    <>
      <PageHeader
        title="Email campaigns"
        description="Write once with AI, send to your lists, see who opened and clicked."
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href="/email/contacts">
                <Users className="size-4" /> Contacts
              </Link>
            </Button>
            <Button asChild>
              <Link href="/email/campaigns/new">
                <Plus className="size-4" /> New campaign
              </Link>
            </Button>
          </>
        }
      />
      {isLoading && <Skeleton className="h-64 w-full" />}
      {data?.items.length === 0 && (
        <EmptyState
          icon={Mail}
          title="No campaigns yet"
          description="Import your contacts, then send your first campaign in minutes."
          action={
            <Button asChild>
              <Link href="/email/campaigns/new">Create a campaign</Link>
            </Button>
          }
        />
      )}
      {!!data?.items.length && (
        <Card className="py-0">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Campaign</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Recipients</TableHead>
                  <TableHead className="text-right">Open rate</TableHead>
                  <TableHead className="text-right">Click rate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <Link
                        href={`/email/campaigns/${c.id}`}
                        className="font-medium hover:underline"
                      >
                        {c.name}
                      </Link>
                      <div className="text-muted-foreground text-xs">
                        {c.status === 'SENT'
                          ? `Sent ${when(c.sentAt)}`
                          : c.scheduledAt
                            ? when(c.scheduledAt)
                            : c.subject}
                      </div>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={c.status} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {c.recipientsCount.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {c.sentCount ? percent(c.openCount / c.sentCount) : '—'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {c.sentCount ? percent(c.clickCount / c.sentCount) : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </>
  );
}
