'use client';

import { creditsFor, type Platform } from '@automarket/shared';
import { useMutation } from '@tanstack/react-query';
import { Loader2, Sparkles, Wand2 } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { CreditCost } from '@/components/shared/credit-cost';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api/client';
import type { AiGeneration, Brand, CaptionOutput, Media } from '@/lib/api/types';

/** Inline AI helper inside the composer: captions with variants and a quick image. */
export function AiAssist({
  brand,
  platforms,
  onUseCaption,
  onImage,
}: {
  brand?: Brand;
  platforms: Platform[];
  onUseCaption: (caption: string) => void;
  onImage: (m: Media) => void;
}) {
  const [brief, setBrief] = useState('');
  const captions = useMutation({
    mutationFn: () =>
      api<AiGeneration<CaptionOutput>>('/ai/text', {
        method: 'POST',
        body: { brandId: brand!.id, kind: 'caption', prompt: brief, platforms },
      }),
  });
  const image = useMutation({
    mutationFn: () =>
      api<AiGeneration>('/ai/image', {
        method: 'POST',
        body: {
          brandId: brand!.id,
          prompt: brief,
          provider: 'openai',
          quality: 'standard',
          aspectRatio: '4:5',
        },
      }),
    onSuccess: (g) => g.media[0] && onImage(g.media[0]),
  });

  if (brand && !brand.aiOptIn) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="size-4 text-violet-500" /> AI assist is off
          </CardTitle>
          <CardDescription>
            Turn on AI content for {brand.name} to get on-brand captions and visuals in one click.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" size="sm" asChild>
            <Link href="/settings?tab=brand">Turn on AI</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="size-4 text-violet-500" /> AI assist
        </CardTitle>
        <CardDescription>Describe the post. AI writes it in your brand voice.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Textarea
          rows={3}
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          placeholder="e.g. Announce our new Ethiopian single-origin, 15% off this weekend"
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            disabled={!brief.trim() || captions.isPending || !brand}
            onClick={() => captions.mutate()}
          >
            {captions.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Wand2 className="size-4" />
            )}{' '}
            Write captions
          </Button>
          <CreditCost credits={creditsFor('text.caption')} />
          <Button
            size="sm"
            variant="outline"
            disabled={!brief.trim() || image.isPending || !brand}
            onClick={() => image.mutate()}
          >
            {image.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Sparkles className="size-4" />
            )}{' '}
            Make image
          </Button>
          <CreditCost credits={creditsFor('image.openai.standard')} />
        </div>
        {captions.data?.output.variants.map((v, i) => {
          const text = `${v.caption}${v.hashtags.length ? `\n\n${v.hashtags.map((h) => (h.startsWith('#') ? h : `#${h}`)).join(' ')}` : ''}`;
          return (
            <button
              key={i}
              type="button"
              onClick={() => onUseCaption(text)}
              className="hover:border-primary hover:bg-muted/40 w-full rounded-lg border p-3 text-left text-sm transition"
            >
              <div className="mb-1 font-medium">{v.hook}</div>
              <div className="text-muted-foreground line-clamp-4 whitespace-pre-line">
                {v.caption}
              </div>
              <div className="text-primary mt-2 text-xs font-medium">Use this →</div>
            </button>
          );
        })}
      </CardContent>
    </Card>
  );
}
