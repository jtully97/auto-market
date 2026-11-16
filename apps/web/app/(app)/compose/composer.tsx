'use client';

import { PLATFORM_SPECS, validateForPlatform, type UpsertPostInput } from '@automarket/shared';
import { format } from 'date-fns';
import {
  AlertCircle,
  CalendarClock,
  Info,
  ListOrdered,
  Loader2,
  Save,
  Send,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { BrandSelect } from '@/components/shared/brand-select';
import { MediaPicker, MediaThumb, UploadButton } from '@/components/shared/media-picker';
import { PageHeader } from '@/components/shared/page-header';
import { PlatformIcon } from '@/components/shared/platform-icon';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { posts, useSocialAccounts } from '@/lib/api/resources';
import type { Media, Post } from '@/lib/api/types';
import { useActiveBrand } from '@/lib/use-brand';
import { cn } from '@/lib/utils';
import { AiAssist } from './ai-assist';

type Timing = 'queue' | 'schedule' | 'now' | 'draft';

const defaultTime = () => format(new Date(Date.now() + 60 * 60 * 1000), "yyyy-MM-dd'T'HH:00");

export function Composer() {
  const editingId = useSearchParams().get('id');
  const { data: existing, isLoading } = posts.useOne(editingId);
  if (editingId && isLoading) {
    return (
      <div className="text-muted-foreground flex items-center gap-2 text-sm">
        <Loader2 className="size-4 animate-spin" /> Loading post…
      </div>
    );
  }
  // Keyed so the form state is initialised once from the post being edited.
  return <ComposerForm key={existing?.id ?? 'new'} existing={existing} />;
}

function ComposerForm({ existing }: { existing?: Post }) {
  const router = useRouter();
  const editingId = existing?.id;
  const { brand: activeBrand, brands, setBrandId: setActiveBrand } = useActiveBrand();
  const [brandId, setBrandIdState] = useState(existing?.brand.id);
  const brand = brands.find((b) => b.id === brandId) ?? activeBrand;
  const setBrandId = (id: string) => {
    setBrandIdState(id);
    setActiveBrand(id);
  };
  const { data: accounts = [] } = useSocialAccounts();

  const [selected, setSelected] = useState<string[]>(
    () => existing?.targets.map((t) => t.account.id) ?? [],
  );
  const [caption, setCaption] = useState(existing?.caption ?? '');
  const [overrides, setOverrides] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      existing?.targets.filter((t) => t.caption).map((t) => [t.account.id, t.caption!]) ?? [],
    ),
  );
  const [media, setMedia] = useState<Media[]>(existing?.media ?? []);
  const [timing, setTiming] = useState<Timing>(() =>
    existing?.status === 'DRAFT' ? 'draft' : existing?.scheduledAt ? 'schedule' : 'queue',
  );
  const [scheduledAt, setScheduledAt] = useState(() =>
    existing?.scheduledAt
      ? format(new Date(existing.scheduledAt), "yyyy-MM-dd'T'HH:mm")
      : defaultTime(),
  );

  const brandAccounts = accounts.filter(
    (a) => a.status !== 'DISCONNECTED' && (!a.brandId || a.brandId === brand?.id),
  );
  const selectedAccounts = brandAccounts.filter((a) => selected.includes(a.id));
  const platforms = [...new Set(selectedAccounts.map((a) => a.platform))];

  const issues = selectedAccounts.flatMap((a) =>
    validateForPlatform(a.platform, overrides[a.id] ?? caption, media),
  );
  const errors = issues.filter((i) => i.severity === 'error');

  const create = posts.useCreate();
  const update = posts.useUpdate();
  const saving = create.isPending || update.isPending;

  const submit = async () => {
    if (!brand) return;
    const body: UpsertPostInput = {
      brandId: brand.id,
      caption,
      mediaIds: media.map((m) => m.id),
      targets: selectedAccounts.map((a) => ({ socialAccountId: a.id, caption: overrides[a.id] })),
      scheduledAt: timing === 'schedule' || timing === 'draft' ? new Date(scheduledAt) : null,
      publishNow: timing === 'now',
      addToQueue: timing === 'queue',
      saveAsDraft: timing === 'draft',
    };
    const post = editingId
      ? await update.mutateAsync({ id: editingId, ...body })
      : await create.mutateAsync(body);
    const msg =
      post.status === 'PENDING_APPROVAL'
        ? 'Sent for approval'
        : timing === 'draft'
          ? 'Draft saved'
          : timing === 'now'
            ? 'Publishing now…'
            : `Scheduled for ${format(new Date(post.scheduledAt!), 'EEE MMM d, h:mm a')}`;
    toast.success(msg);
    router.push(timing === 'draft' ? '/content?status=DRAFT' : '/calendar');
  };

  const toggleAccount = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  return (
    <>
      <PageHeader
        title={editingId ? 'Edit post' : 'Create post'}
        description="Write once, publish everywhere. We adapt it to each platform's rules."
        actions={<BrandSelect brands={brands} value={brand?.id} onChange={setBrandId} />}
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">1. Where should it go?</CardTitle>
            </CardHeader>
            <CardContent>
              {brandAccounts.length === 0 ? (
                <div className="text-muted-foreground text-sm">
                  No channels connected yet.{' '}
                  <Link href="/channels" className="text-foreground underline">
                    Connect Instagram, TikTok, YouTube and more
                  </Link>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {brandAccounts.map((a) => {
                    const on = selected.includes(a.id);
                    return (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => toggleAccount(a.id)}
                        aria-pressed={on}
                        className={cn(
                          'flex items-center gap-2 rounded-full border py-1 pr-3 pl-1 text-sm transition',
                          on
                            ? 'border-primary bg-primary/5 ring-primary/30 ring-2'
                            : 'opacity-60 hover:opacity-100',
                          a.status !== 'CONNECTED' && 'border-destructive',
                        )}
                      >
                        <PlatformIcon platform={a.platform} size="sm" className="rounded-full" />
                        {a.name}
                      </button>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">2. What do you want to say?</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Tabs defaultValue="all">
                <TabsList className="flex-wrap">
                  <TabsTrigger value="all">All channels</TabsTrigger>
                  {selectedAccounts.map((a) => (
                    <TabsTrigger key={a.id} value={a.id} className="gap-1.5">
                      <PlatformIcon platform={a.platform} size="sm" />{' '}
                      {overrides[a.id] !== undefined && '•'}
                    </TabsTrigger>
                  ))}
                </TabsList>
                <TabsContent value="all" className="space-y-2">
                  <Textarea
                    rows={7}
                    value={caption}
                    onChange={(e) => setCaption(e.target.value)}
                    placeholder="Write your caption… use #hashtags and emojis freely"
                  />
                  <div className="flex flex-wrap gap-3">
                    {platforms.map((p) => {
                      const max = PLATFORM_SPECS[p].captionMaxLength;
                      return (
                        <span
                          key={p}
                          className={cn(
                            'text-muted-foreground flex items-center gap-1 text-xs tabular-nums',
                            caption.length > max && 'text-destructive font-medium',
                          )}
                        >
                          <PlatformIcon platform={p} size="sm" /> {caption.length}/
                          {max.toLocaleString()}
                        </span>
                      );
                    })}
                  </div>
                </TabsContent>
                {selectedAccounts.map((a) => (
                  <TabsContent key={a.id} value={a.id} className="space-y-2">
                    <Textarea
                      rows={7}
                      value={overrides[a.id] ?? caption}
                      onChange={(e) => setOverrides((o) => ({ ...o, [a.id]: e.target.value }))}
                      placeholder={`Custom caption for ${PLATFORM_SPECS[a.platform].label}`}
                    />
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">
                        {(overrides[a.id] ?? caption).length}/
                        {PLATFORM_SPECS[a.platform].captionMaxLength.toLocaleString()}
                      </span>
                      {overrides[a.id] !== undefined && (
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={() =>
                            setOverrides((o) =>
                              Object.fromEntries(Object.entries(o).filter(([k]) => k !== a.id)),
                            )
                          }
                        >
                          Use main caption
                        </Button>
                      )}
                    </div>
                  </TabsContent>
                ))}
              </Tabs>

              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Label className="mr-auto">Media</Label>
                  <UploadButton
                    brandId={brand?.id}
                    onUploaded={(m) => setMedia((x) => [...x, m])}
                  />
                  <MediaPicker
                    selectedIds={media.map((m) => m.id)}
                    onPick={(items) => setMedia((x) => [...x, ...items])}
                  />
                </div>
                {media.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {media.map((m) => (
                      <div
                        key={m.id}
                        className="relative size-24 overflow-hidden rounded-lg border"
                      >
                        <MediaThumb item={m} />
                        <button
                          type="button"
                          aria-label="Remove"
                          onClick={() => setMedia((x) => x.filter((y) => y.id !== m.id))}
                          className="absolute top-1 right-1 rounded-full bg-black/60 p-0.5 text-white"
                        >
                          <X className="size-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {issues.length > 0 && (
                <ul className="space-y-1">
                  {issues.map((i, n) => (
                    <li
                      key={n}
                      className={cn(
                        'flex items-start gap-2 text-sm',
                        i.severity === 'error' ? 'text-destructive' : 'text-amber-600',
                      )}
                    >
                      {i.severity === 'error' ? (
                        <AlertCircle className="mt-0.5 size-4 shrink-0" />
                      ) : (
                        <Info className="mt-0.5 size-4 shrink-0" />
                      )}
                      {i.message}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">3. When?</CardTitle>
              <CardDescription>
                The queue drops posts into your next free posting slot automatically.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <RadioGroup
                value={timing}
                onValueChange={(v) => setTiming(v as Timing)}
                className="grid gap-2 sm:grid-cols-2"
              >
                {(
                  [
                    ['queue', 'Add to queue', 'Next free slot in your schedule', ListOrdered],
                    ['schedule', 'Pick a time', 'Choose an exact date and time', CalendarClock],
                    ['now', 'Publish now', 'Goes out in the next minute', Send],
                    ['draft', 'Save draft', "Finish it later — won't publish", Save],
                  ] as const
                ).map(([value, title, hint, Icon]) => (
                  <Label
                    key={value}
                    htmlFor={`t-${value}`}
                    className={cn(
                      'flex cursor-pointer items-start gap-3 rounded-lg border p-3',
                      timing === value && 'border-primary bg-primary/5',
                    )}
                  >
                    <RadioGroupItem id={`t-${value}`} value={value} className="mt-0.5" />
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-1.5 font-medium">
                        <Icon className="size-4" /> {title}
                      </div>
                      <div className="text-muted-foreground text-xs font-normal">{hint}</div>
                    </div>
                  </Label>
                ))}
              </RadioGroup>
              {(timing === 'schedule' || timing === 'draft') && (
                <Input
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                  className="w-64"
                  aria-label="Publish time"
                />
              )}
            </CardContent>
          </Card>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => router.back()}>
              Cancel
            </Button>
            <Button
              size="lg"
              onClick={() => void submit()}
              disabled={
                saving ||
                !brand ||
                !selectedAccounts.length ||
                (timing !== 'draft' && errors.length > 0)
              }
            >
              {saving && <Loader2 className="size-4 animate-spin" />}
              {timing === 'draft'
                ? 'Save draft'
                : timing === 'now'
                  ? 'Publish now'
                  : timing === 'queue'
                    ? 'Add to queue'
                    : 'Schedule post'}
            </Button>
          </div>
        </div>

        <div className="space-y-6">
          <AiAssist
            brand={brand}
            platforms={platforms}
            onUseCaption={setCaption}
            onImage={(m) => setMedia((x) => [...x, m])}
          />
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Preview</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-hidden rounded-xl border">
                <div className="flex items-center gap-2 p-3">
                  <div className="bg-muted size-8 rounded-full" />
                  <span className="text-sm font-medium">{brand?.name ?? 'Your brand'}</span>
                </div>
                {media[0] && (
                  <div className="aspect-[4/5]">
                    <MediaThumb item={media[0]} />
                  </div>
                )}
                <p className="p-3 text-sm whitespace-pre-line">
                  {caption || (
                    <span className="text-muted-foreground">Your caption appears here</span>
                  )}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
