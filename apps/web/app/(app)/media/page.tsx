'use client';

import { Images, Sparkles, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { EmptyState } from '@/components/shared/empty-state';
import { MediaThumb, UploadButton } from '@/components/shared/media-picker';
import { PageHeader } from '@/components/shared/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { media } from '@/lib/api/resources';
import { useActiveBrand } from '@/lib/use-brand';

export default function MediaPage() {
  const [kind, setKind] = useState<string>('');
  const { brand } = useActiveBrand();
  const { data, isLoading } = media.useList({ kind: kind || undefined, pageSize: 100 });
  const remove = media.useRemove();

  return (
    <>
      <PageHeader
        title="Media library"
        description="Uploads and AI creations, ready to drop into any post."
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href="/studio?tab=image">
                <Sparkles className="size-4" /> Generate
              </Link>
            </Button>
            <UploadButton brandId={brand?.id} onUploaded={() => undefined} />
          </>
        }
      />
      <ToggleGroup
        type="single"
        value={kind}
        onValueChange={setKind}
        variant="outline"
        className="mb-4"
      >
        <ToggleGroupItem value="">All</ToggleGroupItem>
        <ToggleGroupItem value="IMAGE">Images</ToggleGroupItem>
        <ToggleGroupItem value="VIDEO">Videos</ToggleGroupItem>
      </ToggleGroup>
      {isLoading && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton key={i} className="aspect-square" />
          ))}
        </div>
      )}
      {data?.items.length === 0 && (
        <EmptyState
          icon={Images}
          title="No media yet"
          description="Upload images and videos, or create them with AI."
        />
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        {data?.items.map((m) => (
          <div
            key={m.id}
            className="group relative aspect-square overflow-hidden rounded-xl border"
          >
            <MediaThumb item={m} />
            {m.source === 'AI' && (
              <Badge className="absolute top-1.5 left-1.5 gap-1 bg-violet-600 text-white">
                <Sparkles className="size-3" /> AI
              </Badge>
            )}
            <Button
              size="icon-sm"
              variant="secondary"
              aria-label="Delete"
              className="absolute top-1.5 right-1.5 opacity-0 transition group-hover:opacity-100"
              onClick={() => remove.mutate(m.id)}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        ))}
      </div>
    </>
  );
}
