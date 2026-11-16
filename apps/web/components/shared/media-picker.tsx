'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Check, Images, Loader2, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { media as mediaResource } from '@/lib/api/resources';
import type { Media } from '@/lib/api/types';
import { uploadMedia } from '@/lib/upload';
import { cn } from '@/lib/utils';

export function MediaThumb({ item, className }: { item: Media; className?: string }) {
  return item.kind === 'VIDEO' ? (
    <video
      src={item.url}
      className={cn('bg-muted size-full object-cover', className)}
      muted
      playsInline
    />
  ) : (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={item.url} alt="" className={cn('bg-muted size-full object-cover', className)} />
  );
}

/** Upload button that reports progress with a toast and returns the created media. */
export function UploadButton({
  brandId,
  onUploaded,
  label = 'Upload',
  multiple = true,
}: {
  brandId?: string;
  onUploaded: (m: Media) => void;
  label?: string;
  multiple?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();
  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    try {
      for (const file of Array.from(files)) onUploaded(await uploadMedia(file, brandId));
      qc.invalidateQueries({ queryKey: ['media'] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setBusy(false);
      if (ref.current) ref.current.value = '';
    }
  };
  return (
    <>
      <input
        ref={ref}
        type="file"
        hidden
        multiple={multiple}
        accept="image/*,video/mp4,video/quicktime,video/webm"
        onChange={(e) => void onFiles(e.target.files)}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => ref.current?.click()}
        disabled={busy}
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />} {label}
      </Button>
    </>
  );
}

export function MediaPicker({
  onPick,
  selectedIds = [],
}: {
  onPick: (items: Media[]) => void;
  selectedIds?: string[];
}) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<Media[]>([]);
  const { data, isLoading } = mediaResource.useList({ pageSize: 60 }, { enabled: open });
  const toggle = (m: Media) =>
    setPicked((p) => (p.some((x) => x.id === m.id) ? p.filter((x) => x.id !== m.id) : [...p, m]));

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        setPicked([]);
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <Images className="size-4" /> Library
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Media library</DialogTitle>
          <DialogDescription>
            Pick images or videos — uploads and AI creations are all here.
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="h-[420px]">
          {isLoading && (
            <Loader2 className="text-muted-foreground mx-auto mt-20 size-6 animate-spin" />
          )}
          {data?.items.length === 0 && (
            <p className="text-muted-foreground py-20 text-center text-sm">
              Your library is empty. Upload something or generate it in AI Studio.
            </p>
          )}
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {data?.items.map((m) => {
              const on = picked.some((x) => x.id === m.id);
              const already = selectedIds.includes(m.id);
              return (
                <button
                  type="button"
                  key={m.id}
                  disabled={already}
                  onClick={() => toggle(m)}
                  className={cn(
                    'relative aspect-square overflow-hidden rounded-lg border-2 border-transparent transition',
                    on && 'border-primary',
                    already && 'opacity-40',
                  )}
                >
                  <MediaThumb item={m} />
                  {on && (
                    <span className="bg-primary text-primary-foreground absolute top-1.5 right-1.5 rounded-full p-0.5">
                      <Check className="size-3" />
                    </span>
                  )}
                  {m.kind === 'VIDEO' && (
                    <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1 text-[10px] text-white">
                      VIDEO
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </ScrollArea>
        <DialogFooter>
          <Button
            disabled={!picked.length}
            onClick={() => {
              onPick(picked);
              setOpen(false);
            }}
          >
            Add {picked.length || ''} item{picked.length === 1 ? '' : 's'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
