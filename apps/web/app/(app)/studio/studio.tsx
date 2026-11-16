'use client';

import {
  creditsFor,
  PLATFORMS,
  PLATFORM_SPECS,
  videoCredits,
  type Platform,
} from '@automarket/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarPlus, Copy, Film, ImageIcon, Loader2, PenLine, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { BrandSelect } from '@/components/shared/brand-select';
import { CreditCost } from '@/components/shared/credit-cost';
import { MediaPicker, MediaThumb } from '@/components/shared/media-picker';
import { PageHeader } from '@/components/shared/page-header';
import { PlatformIcon } from '@/components/shared/platform-icon';
import { StatusBadge } from '@/components/shared/status-badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldLabel } from '@/components/ui/field';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { api } from '@/lib/api/client';
import { generations } from '@/lib/api/resources';
import type {
  AiGeneration,
  CaptionOutput,
  ContentPlanOutput,
  EmailOutput,
  Media,
} from '@/lib/api/types';
import { ago } from '@/lib/format';
import { useActiveBrand } from '@/lib/use-brand';

type TextKind = 'caption' | 'hashtags' | 'repurpose' | 'email' | 'contentPlan';
const TEXT_KINDS: {
  value: TextKind;
  label: string;
  action: Parameters<typeof creditsFor>[0];
  placeholder: string;
}[] = [
  {
    value: 'caption',
    label: 'Post captions',
    action: 'text.caption',
    placeholder: 'What is the post about? e.g. behind the scenes of our roasting day',
  },
  {
    value: 'contentPlan',
    label: 'Week of content',
    action: 'text.contentPlan',
    placeholder: 'Any focus for the week? e.g. push our holiday gift bundle',
  },
  {
    value: 'repurpose',
    label: 'Repurpose',
    action: 'text.repurpose',
    placeholder: 'Paste a blog post, video script or long caption to adapt for each platform',
  },
  {
    value: 'hashtags',
    label: 'Hashtags',
    action: 'text.hashtags',
    placeholder: 'Topic of the post',
  },
  {
    value: 'email',
    label: 'Email',
    action: 'text.email',
    placeholder: 'What is the email about? e.g. November newsletter + 20% off',
  },
];

const copy = (text: string) =>
  navigator.clipboard.writeText(text).then(() => toast.success('Copied'));

function TextResult({ g }: { g: AiGeneration }) {
  const router = useRouter();
  const qc = useQueryClient();
  const toDrafts = useMutation({
    mutationFn: () =>
      api<{ created: number }>(`/ai/generations/${g.id}/drafts`, { method: 'POST' }),
    onSuccess: ({ created }) => {
      qc.invalidateQueries({ queryKey: ['posts'] });
      toast.success(`${created} drafts added for your approval`);
      router.push('/content?status=PENDING_APPROVAL');
    },
  });

  if (g.action === 'text.caption') {
    return (
      <div className="grid gap-3 md:grid-cols-3">
        {(g.output as CaptionOutput).variants.map((v, i) => (
          <Card key={i}>
            <CardHeader>
              <CardTitle className="text-sm">{v.hook}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p className="whitespace-pre-line">{v.caption}</p>
              <p className="text-primary">
                {v.hashtags.map((h) => (h.startsWith('#') ? h : `#${h}`)).join(' ')}
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void copy(`${v.caption}\n\n${v.hashtags.join(' ')}`)}
              >
                <Copy className="size-4" /> Copy
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }
  if (g.action === 'text.contentPlan') {
    const plan = g.output as ContentPlanOutput;
    return (
      <div className="space-y-3">
        <Button onClick={() => toDrafts.mutate()} disabled={toDrafts.isPending}>
          {toDrafts.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <CalendarPlus className="size-4" />
          )}{' '}
          Add all {plan.ideas.length} as drafts for approval
        </Button>
        {plan.ideas.map((idea, i) => (
          <Card key={i} className="py-4">
            <CardContent className="space-y-2 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">Day {idea.dayOffset + 1}</span>
                <span className="text-muted-foreground">· {idea.format}</span>
                {idea.platforms.map((p) => (
                  <PlatformIcon key={p} platform={p} size="sm" />
                ))}
              </div>
              <p className="font-medium">{idea.hook}</p>
              <p className="whitespace-pre-line">{idea.caption}</p>
              <p className="text-muted-foreground text-xs">
                <b>Visual:</b> {idea.visualPrompt} · <b>Why:</b> {idea.rationale}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }
  if (g.action === 'text.email') {
    const e = g.output as EmailOutput;
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{e.subjectLines[0]}</CardTitle>
          <CardDescription>Alternatives: {e.subjectLines.slice(1).join(' · ')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <iframe
            title="Email preview"
            sandbox=""
            srcDoc={e.html}
            className="h-96 w-full rounded-lg border bg-white"
          />
          <Button asChild>
            <Link href={`/email/campaigns/new?fromGeneration=${g.id}`}>Use in a campaign</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardContent>
        <pre className="text-xs whitespace-pre-wrap">{JSON.stringify(g.output, null, 2)}</pre>
      </CardContent>
    </Card>
  );
}

/** Polls an async generation (Higgsfield) until it finishes. */
function useLiveGeneration(id: string | null) {
  return useQuery({
    queryKey: ['generations', 'one', id],
    queryFn: () => api<AiGeneration>(`/ai/generations/${id}`),
    enabled: Boolean(id),
    refetchInterval: (q) => (q.state.data?.status === 'RUNNING' ? 4000 : false),
  });
}

function MediaResult({ g }: { g: AiGeneration }) {
  if (g.status === 'RUNNING') {
    return (
      <div className="text-muted-foreground flex items-center gap-2 rounded-lg border border-dashed p-10 text-sm">
        <Loader2 className="size-4 animate-spin" /> Generating — this can take a minute or two. You
        can leave this page; it lands in your Media library.
      </div>
    );
  }
  if (g.status !== 'SUCCEEDED') {
    return (
      <Alert variant="destructive">
        <AlertTitle>Generation {g.status.toLowerCase()}</AlertTitle>
        <AlertDescription>{g.error} No credits were charged.</AlertDescription>
      </Alert>
    );
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {g.media.map((m) => (
        <div key={m.id} className="space-y-2">
          <div className="overflow-hidden rounded-xl border">
            {m.kind === 'VIDEO' ? (
              <video src={m.url} controls className="w-full" />
            ) : (
              <MediaThumb item={m} />
            )}
          </div>
          <Button size="sm" asChild>
            <Link href="/compose">Use in a post</Link>
          </Button>
        </div>
      ))}
    </div>
  );
}

export function Studio() {
  const params = useSearchParams();
  const router = useRouter();
  const tab = params.get('tab') ?? 'write';
  const { brand, brands, setBrandId } = useActiveBrand();

  const [kind, setKind] = useState<TextKind>('caption');
  const [prompt, setPrompt] = useState('');
  const [platforms, setPlatforms] = useState<Platform[]>(['INSTAGRAM']);
  const [provider, setProvider] = useState<'openai' | 'higgsfield'>('openai');
  const [quality, setQuality] = useState<'standard' | 'hd'>('standard');
  const [aspectRatio, setAspectRatio] = useState('4:5');
  const [duration, setDuration] = useState<5 | 10 | 15>(5);
  const [resolution, setResolution] = useState<'480p' | '720p' | '1080p'>('720p');
  const [sourceImage, setSourceImage] = useState<Media | null>(null);
  const [resultId, setResultId] = useState<string | null>(null);

  const qc = useQueryClient();
  const done = (g: AiGeneration) => {
    setResultId(g.id);
    qc.setQueryData(['generations', 'one', g.id], g);
    qc.invalidateQueries({ queryKey: ['credits'] });
    qc.invalidateQueries({ queryKey: ['generations', 'list'] });
  };
  const text = useMutation({
    mutationFn: () =>
      api<AiGeneration>('/ai/text', {
        method: 'POST',
        body: { brandId: brand!.id, kind, prompt, platforms },
      }),
    onSuccess: done,
  });
  const image = useMutation({
    mutationFn: () =>
      api<AiGeneration>('/ai/image', {
        method: 'POST',
        body: { brandId: brand!.id, provider, prompt, quality, aspectRatio },
      }),
    onSuccess: done,
  });
  const video = useMutation({
    mutationFn: () =>
      api<AiGeneration>('/ai/video', {
        method: 'POST',
        body: {
          brandId: brand!.id,
          prompt,
          durationSeconds: duration,
          resolution,
          imageMediaId: sourceImage?.id,
        },
      }),
    onSuccess: done,
  });
  const { data: result } = useLiveGeneration(resultId);
  const history = generations.useList({ pageSize: 20 }, { enabled: tab === 'history' });

  const kindInfo = TEXT_KINDS.find((k) => k.value === kind)!;
  const imageCost = creditsFor(`image.${provider}.${quality}` as Parameters<typeof creditsFor>[0]);
  const busy = text.isPending || image.isPending || video.isPending;

  return (
    <>
      <PageHeader
        title="AI Studio"
        description="On-brand copy, images and video — grounded in your brand profile and what performs for you."
        actions={<BrandSelect brands={brands} value={brand?.id} onChange={setBrandId} />}
      />

      {brand && !brand.aiOptIn && (
        <Alert className="mb-6">
          <Sparkles className="size-4" />
          <AlertTitle>AI content is off for {brand.name}</AlertTitle>
          <AlertDescription>
            You&apos;re in control — AI only runs when you opt in.{' '}
            <Link className="underline" href="/settings?tab=brand">
              Turn it on in Brand settings
            </Link>
          </AlertDescription>
        </Alert>
      )}

      <Tabs
        value={tab}
        onValueChange={(v) => {
          setResultId(null);
          router.replace(`/studio?tab=${v}`);
        }}
      >
        <TabsList>
          <TabsTrigger value="write">
            <PenLine className="size-4" /> Write
          </TabsTrigger>
          <TabsTrigger value="image">
            <ImageIcon className="size-4" /> Image
          </TabsTrigger>
          <TabsTrigger value="video">
            <Film className="size-4" /> Video
          </TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="write" className="mt-4 space-y-4">
          <Card>
            <CardContent className="space-y-4">
              <ToggleGroup
                type="single"
                variant="outline"
                value={kind}
                onValueChange={(v) => v && setKind(v as TextKind)}
                className="flex-wrap"
              >
                {TEXT_KINDS.map((k) => (
                  <ToggleGroupItem key={k.value} value={k.value}>
                    {k.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              {kind !== 'email' && (
                <div className="flex flex-wrap gap-1.5">
                  {PLATFORMS.map((p) => {
                    const on = platforms.includes(p);
                    return (
                      <Button
                        key={p}
                        type="button"
                        size="sm"
                        variant={on ? 'secondary' : 'ghost'}
                        aria-pressed={on}
                        onClick={() =>
                          setPlatforms((x) => (on ? x.filter((y) => y !== p) : [...x, p]))
                        }
                      >
                        <PlatformIcon platform={p} size="sm" /> {PLATFORM_SPECS[p].label}
                      </Button>
                    );
                  })}
                </div>
              )}
              <Textarea
                rows={4}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={kindInfo.placeholder}
              />
              <div className="flex items-center gap-3">
                <Button
                  onClick={() => text.mutate()}
                  disabled={!prompt.trim() || busy || !brand?.aiOptIn}
                >
                  {text.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Sparkles className="size-4" />
                  )}{' '}
                  Generate
                </Button>
                <CreditCost credits={creditsFor(kindInfo.action)} />
              </div>
            </CardContent>
          </Card>
          {result && result.type === 'TEXT' && <TextResult g={result} />}
        </TabsContent>

        <TabsContent value="image" className="mt-4 space-y-4">
          <Card>
            <CardContent className="space-y-4">
              <Textarea
                rows={3}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe the image: subject, setting, mood, style. e.g. flat-lay of a pour-over coffee setup on warm oak, morning light"
              />
              <div className="grid gap-4 sm:grid-cols-3">
                <Field>
                  <FieldLabel>Engine</FieldLabel>
                  <Select value={provider} onValueChange={(v) => setProvider(v as typeof provider)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="openai">OpenAI — best for text & graphics</SelectItem>
                      <SelectItem value="higgsfield">Higgsfield — photoreal & cinematic</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel>Quality</FieldLabel>
                  <Select value={quality} onValueChange={(v) => setQuality(v as typeof quality)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="standard">Standard</SelectItem>
                      <SelectItem value="hd">HD</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel>Shape</FieldLabel>
                  <Select value={aspectRatio} onValueChange={setAspectRatio}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="4:5">Portrait 4:5 (feed)</SelectItem>
                      <SelectItem value="1:1">Square 1:1</SelectItem>
                      <SelectItem value="9:16">Vertical 9:16 (stories, reels)</SelectItem>
                      <SelectItem value="16:9">Landscape 16:9</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              <div className="flex items-center gap-3">
                <Button
                  onClick={() => image.mutate()}
                  disabled={!prompt.trim() || busy || !brand?.aiOptIn}
                >
                  {image.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Sparkles className="size-4" />
                  )}{' '}
                  Create image
                </Button>
                <CreditCost credits={imageCost} />
              </div>
            </CardContent>
          </Card>
          {result && result.type === 'IMAGE' && <MediaResult g={result} />}
        </TabsContent>

        <TabsContent value="video" className="mt-4 space-y-4">
          <Card>
            <CardContent className="space-y-4">
              <Textarea
                rows={3}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe the shot and camera movement. e.g. slow push-in on coffee being poured into a glass cup, steam rising, cinematic"
              />
              <div className="grid gap-4 sm:grid-cols-3">
                <Field>
                  <FieldLabel>Length</FieldLabel>
                  <ToggleGroup
                    type="single"
                    variant="outline"
                    value={String(duration)}
                    onValueChange={(v) => v && setDuration(Number(v) as 5 | 10 | 15)}
                  >
                    <ToggleGroupItem value="5">5s</ToggleGroupItem>
                    <ToggleGroupItem value="10">10s</ToggleGroupItem>
                    <ToggleGroupItem value="15">15s</ToggleGroupItem>
                  </ToggleGroup>
                </Field>
                <Field>
                  <FieldLabel>Resolution</FieldLabel>
                  <Select
                    value={resolution}
                    onValueChange={(v) => setResolution(v as typeof resolution)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="480p">480p (draft)</SelectItem>
                      <SelectItem value="720p">720p</SelectItem>
                      <SelectItem value="1080p">1080p</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel>Start from an image (optional)</FieldLabel>
                  <div className="flex items-center gap-2">
                    {sourceImage && (
                      <div className="size-8 overflow-hidden rounded">
                        <MediaThumb item={sourceImage} />
                      </div>
                    )}
                    <MediaPicker
                      onPick={(items) =>
                        setSourceImage(items.find((m) => m.kind === 'IMAGE') ?? null)
                      }
                    />
                  </div>
                </Field>
              </div>
              <div className="flex items-center gap-3">
                <Button
                  onClick={() => video.mutate()}
                  disabled={!prompt.trim() || busy || !brand?.aiOptIn}
                >
                  {video.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Film className="size-4" />
                  )}{' '}
                  Create video
                </Button>
                <CreditCost credits={videoCredits(duration, resolution)} />
                <span className="text-muted-foreground text-xs">Charged only if it succeeds.</span>
              </div>
            </CardContent>
          </Card>
          {result && result.type === 'VIDEO' && <MediaResult g={result} />}
        </TabsContent>

        <TabsContent value="history" className="mt-4 space-y-2">
          {history.data?.items.map((g) => (
            <Card key={g.id} className="py-3">
              <CardContent className="flex items-center gap-3 text-sm">
                <StatusBadge status={g.status} />
                <span className="text-muted-foreground w-40 shrink-0">{g.action}</span>
                <span className="min-w-0 flex-1 truncate">{g.prompt}</span>
                <span className="text-muted-foreground shrink-0 text-xs">
                  {g.creditsCharged} cr · {ago(g.createdAt)}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setResultId(g.id);
                    router.replace(
                      `/studio?tab=${g.type === 'TEXT' ? 'write' : g.type.toLowerCase()}`,
                    );
                  }}
                >
                  Open
                </Button>
              </CardContent>
            </Card>
          ))}
          {history.data?.items.length === 0 && (
            <p className="text-muted-foreground text-sm">No generations yet.</p>
          )}
        </TabsContent>
      </Tabs>
    </>
  );
}
