'use client';

import type { PostStatus } from '@automarket/shared';
import {
  Check,
  Copy,
  ExternalLink,
  ListChecks,
  MoreHorizontal,
  Pencil,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { useSession } from '@/components/providers/session';
import { EmptyState } from '@/components/shared/empty-state';
import { MediaThumb } from '@/components/shared/media-picker';
import { PageHeader } from '@/components/shared/page-header';
import { PlatformIcon } from '@/components/shared/platform-icon';
import { StatusBadge } from '@/components/shared/status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { posts } from '@/lib/api/resources';
import type { Post } from '@/lib/api/types';
import { when } from '@/lib/format';

const TABS: { value: PostStatus | 'ALL'; label: string }[] = [
  { value: 'SCHEDULED', label: 'Scheduled' },
  { value: 'PENDING_APPROVAL', label: 'Needs approval' },
  { value: 'DRAFT', label: 'Drafts' },
  { value: 'PUBLISHED', label: 'Published' },
  { value: 'FAILED', label: 'Failed' },
  { value: 'ALL', label: 'All' },
];

function PostRow({ post }: { post: Post }) {
  const { can } = useSession();
  const approve = posts.useAction(({ id }) => ({ path: `/${id}/approve` }));
  const retry = posts.useAction(({ id }) => ({ path: `/${id}/retry` }));
  const duplicate = posts.useAction(({ id }) => ({ path: `/${id}/duplicate` }));
  const remove = posts.useRemove();
  const editable = ['DRAFT', 'SCHEDULED', 'PENDING_APPROVAL', 'FAILED'].includes(post.status);

  return (
    <Card className="py-0">
      <CardContent className="flex items-center gap-4 p-3">
        <div className="size-16 shrink-0 overflow-hidden rounded-lg border">
          {post.media[0] ? (
            <MediaThumb item={post.media[0]} />
          ) : (
            <div className="bg-muted size-full" />
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={post.status} />
            <span className="text-muted-foreground text-xs">
              {post.status === 'PUBLISHED' ? when(post.publishedAt) : when(post.scheduledAt)}
            </span>
            {post.inQueue && <span className="text-muted-foreground text-xs">· from queue</span>}
          </div>
          <p className="line-clamp-2 text-sm">
            {post.caption || <span className="text-muted-foreground">No caption</span>}
          </p>
          {post.failureReason && (
            <p className="text-destructive line-clamp-1 text-xs">{post.failureReason}</p>
          )}
        </div>
        <div className="hidden items-center gap-1 sm:flex">
          {post.targets.map((t) =>
            t.externalUrl ? (
              <a
                key={t.id}
                href={t.externalUrl}
                target="_blank"
                rel="noreferrer"
                title={`${t.account.name} · ${t.status.toLowerCase()}`}
              >
                <PlatformIcon platform={t.account.platform} size="sm" />
              </a>
            ) : (
              <span
                key={t.id}
                title={`${t.account.name} · ${t.status.toLowerCase()}`}
                className={t.status === 'FAILED' ? 'opacity-40' : ''}
              >
                <PlatformIcon platform={t.account.platform} size="sm" />
              </span>
            ),
          )}
        </div>
        {post.status === 'PENDING_APPROVAL' && can('ADMIN') && (
          <Button
            size="sm"
            onClick={() =>
              approve.mutate(
                { id: post.id },
                { onSuccess: () => toast.success('Approved and scheduled') },
              )
            }
          >
            <Check className="size-4" /> Approve
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Post actions">
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {editable && (
              <DropdownMenuItem asChild>
                <Link href={`/compose?id=${post.id}`}>
                  <Pencil className="size-4" /> Edit
                </Link>
              </DropdownMenuItem>
            )}
            {['FAILED', 'PARTIALLY_PUBLISHED'].includes(post.status) && (
              <DropdownMenuItem
                onClick={() =>
                  retry.mutate({ id: post.id }, { onSuccess: () => toast.success('Retrying now') })
                }
              >
                <RotateCcw className="size-4" /> Retry failed channels
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              onClick={() =>
                duplicate.mutate(
                  { id: post.id },
                  { onSuccess: () => toast.success('Copied to drafts') },
                )
              }
            >
              <Copy className="size-4" /> Duplicate
            </DropdownMenuItem>
            {post.targets.find((t) => t.externalUrl) && (
              <DropdownMenuItem asChild>
                <a
                  href={post.targets.find((t) => t.externalUrl)!.externalUrl!}
                  target="_blank"
                  rel="noreferrer"
                >
                  <ExternalLink className="size-4" /> View live
                </a>
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onClick={() =>
                remove.mutate(post.id, { onSuccess: () => toast.success('Post deleted') })
              }
            >
              <Trash2 className="size-4" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardContent>
    </Card>
  );
}

export function ContentQueue() {
  const router = useRouter();
  const status = (useSearchParams().get('status') as PostStatus | 'ALL' | null) ?? 'SCHEDULED';
  const { data, isLoading } = posts.useList({
    status: status === 'ALL' ? undefined : status,
    pageSize: 100,
  });

  return (
    <>
      <PageHeader
        title="Content queue"
        description="Everything that's planned, waiting for review, or already live."
        actions={
          <Button asChild>
            <Link href="/compose">Create post</Link>
          </Button>
        }
      />
      <Tabs
        value={status}
        onValueChange={(v) => router.replace(`/content?status=${v}`)}
        className="mb-4"
      >
        <TabsList className="flex-wrap">
          {TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <div className="space-y-2">
        {isLoading &&
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
        {data?.items.length === 0 && (
          <EmptyState
            icon={ListChecks}
            title="Nothing here"
            description="Posts you create show up here."
            action={
              <Button asChild>
                <Link href="/compose">Create a post</Link>
              </Button>
            }
          />
        )}
        {data?.items.map((p) => (
          <PostRow key={p.id} post={p} />
        ))}
      </div>
    </>
  );
}
