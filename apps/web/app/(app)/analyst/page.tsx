'use client';

import { creditsFor } from '@automarket/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Brain, Lightbulb, Loader2, RefreshCw, Target, TrendingUp, Users } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { BrandSelect } from '@/components/shared/brand-select';
import { CreditCost } from '@/components/shared/credit-cost';
import { EmptyState } from '@/components/shared/empty-state';
import { PageHeader } from '@/components/shared/page-header';
import { PlatformIcon } from '@/components/shared/platform-icon';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api } from '@/lib/api/client';
import type { AiGeneration, NicheReport, PerformanceInsights } from '@/lib/api/types';
import { ago } from '@/lib/format';
import { useActiveBrand } from '@/lib/use-brand';

const RELEVANCE: Record<string, string> = {
  high: 'bg-emerald-500/15 text-emerald-700',
  medium: 'bg-amber-500/15 text-amber-700',
  low: 'bg-muted',
};

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Brain;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="size-4 text-violet-500" /> {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">{children}</CardContent>
    </Card>
  );
}

function ReportView({ r }: { r: NicheReport }) {
  return (
    <div className="space-y-6">
      <Card className="border-violet-500/30 bg-violet-500/5">
        <CardContent className="text-sm leading-relaxed">{r.summary}</CardContent>
      </Card>
      <div className="grid gap-6 lg:grid-cols-2">
        <Section icon={TrendingUp} title="What's trending in your lane">
          {r.trends.map((t) => (
            <div key={t.title}>
              <div className="flex items-center gap-2 font-medium">
                {t.title}
                <Badge variant="secondary" className={RELEVANCE[t.relevance]}>
                  {t.relevance}
                </Badge>
              </div>
              <p className="text-muted-foreground">{t.description}</p>
            </div>
          ))}
        </Section>
        <Section icon={Users} title="Who you're talking to">
          {r.audience.personas.map((p) => (
            <div key={p.name}>
              <div className="font-medium">{p.name}</div>
              <p className="text-muted-foreground">{p.description}</p>
              <p className="text-xs">Pain points: {p.painPoints.join(' · ')}</p>
            </div>
          ))}
        </Section>
        <Section icon={Target} title="Content pillars">
          {r.contentPillars.map((p) => (
            <div key={p.name}>
              <div className="font-medium">{p.name}</div>
              <p className="text-muted-foreground">{p.description}</p>
              <ul className="mt-1 list-disc pl-5 text-xs">
                {p.exampleIdeas.map((i) => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
            </div>
          ))}
        </Section>
        <Section icon={Lightbulb} title="Competitor gaps to exploit">
          {r.competitorAngles.map((c) => (
            <div key={c.competitor}>
              <div className="font-medium">{c.competitor}</div>
              <p className="text-muted-foreground">Works for them: {c.whatWorks}</p>
              <p>Your opening: {c.gapToExploit}</p>
            </div>
          ))}
        </Section>
      </div>
      <Section icon={Brain} title="Platform playbook">
        <div className="grid gap-3 md:grid-cols-2">
          {r.platformStrategy.map((p) => (
            <div key={p.platform} className="flex gap-3 rounded-lg border p-3">
              <PlatformIcon platform={p.platform} />
              <div>
                <div className="font-medium">
                  {p.cadencePerWeek}× / week · {p.bestTimes.join(', ')}
                </div>
                <p className="text-muted-foreground">{p.focus}</p>
              </div>
            </div>
          ))}
        </div>
      </Section>
      <div className="grid gap-6 lg:grid-cols-2">
        <Section icon={Lightbulb} title="Opportunities">
          <ul className="list-disc space-y-1 pl-5">
            {r.opportunities.map((o) => (
              <li key={o}>{o}</li>
            ))}
          </ul>
        </Section>
        <Section icon={TrendingUp} title="Hashtags & sources">
          <p className="text-primary">
            {r.hashtags.map((h) => (h.startsWith('#') ? h : `#${h}`)).join(' ')}
          </p>
          <ul className="text-muted-foreground space-y-1 text-xs">
            {r.sources.slice(0, 8).map((s) => (
              <li key={s} className="truncate">
                <a href={s} target="_blank" rel="noreferrer" className="underline">
                  {s}
                </a>
              </li>
            ))}
          </ul>
        </Section>
      </div>
    </div>
  );
}

export default function AnalystPage() {
  const { brand, brands, setBrandId } = useActiveBrand();
  const [question, setQuestion] = useState('');
  const qc = useQueryClient();
  const run = useMutation({
    mutationFn: (kind: 'nicheReport' | 'performanceInsights') =>
      api<AiGeneration>('/ai/analyst', {
        method: 'POST',
        body: { brandId: brand!.id, kind, question: question || undefined },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['brands'] });
      qc.invalidateQueries({ queryKey: ['credits'] });
    },
  });
  const insights =
    run.data?.action === 'analyst.performanceInsights'
      ? (run.data.output as PerformanceInsights)
      : null;
  const report = brand?.insights;
  const ready = brand?.aiOptIn && (brand.niche || brand.industry || brand.description);

  return (
    <>
      <PageHeader
        title="AI Analyst"
        description="Studies your market lane — trends, audience, competitors — so every AI post is relevant, not generic."
        actions={<BrandSelect brands={brands} value={brand?.id} onChange={setBrandId} />}
      />
      {!ready ? (
        <EmptyState
          icon={Brain}
          title="Tell the analyst about your business"
          description="Add your niche, audience and competitors and turn on AI in Brand settings. The more context, the sharper the insights."
          action={
            <Button asChild>
              <Link href="/settings?tab=brand">Open Brand settings</Link>
            </Button>
          }
        />
      ) : (
        <Tabs defaultValue="niche">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <TabsList>
              <TabsTrigger value="niche">Niche report</TabsTrigger>
              <TabsTrigger value="performance">Performance insights</TabsTrigger>
            </TabsList>
            <Input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Optional: ask the analyst something specific"
              className="max-w-sm"
            />
          </div>
          <TabsContent value="niche" className="mt-4 space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={() => run.mutate('nicheReport')} disabled={run.isPending}>
                {run.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <RefreshCw className="size-4" />
                )}{' '}
                {report ? 'Refresh research' : 'Research my niche'}
              </Button>
              <CreditCost credits={creditsFor('analyst.nicheReport')} />
              {brand?.insightsUpdatedAt && (
                <span className="text-muted-foreground text-xs">
                  Last updated {ago(brand.insightsUpdatedAt)}
                </span>
              )}
            </div>
            {run.isPending && (
              <p className="text-muted-foreground text-sm">
                Searching the web and studying your lane — about a minute…
              </p>
            )}
            {report ? (
              <ReportView r={report} />
            ) : (
              !run.isPending && (
                <EmptyState
                  icon={Brain}
                  title="No research yet"
                  description="Run your first niche report. It's saved and used by every future AI generation."
                />
              )
            )}
          </TabsContent>
          <TabsContent value="performance" className="mt-4 space-y-4">
            <div className="flex items-center gap-3">
              <Button onClick={() => run.mutate('performanceInsights')} disabled={run.isPending}>
                {run.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Brain className="size-4" />
                )}{' '}
                Analyse my last 90 days
              </Button>
              <CreditCost credits={creditsFor('analyst.performanceInsights')} />
            </div>
            {insights && (
              <div className="space-y-6">
                <Card className="border-violet-500/30 bg-violet-500/5">
                  <CardHeader>
                    <CardTitle>{insights.headline}</CardTitle>
                  </CardHeader>
                </Card>
                <div className="grid gap-6 md:grid-cols-2">
                  <Section icon={TrendingUp} title="What's working">
                    <ul className="list-disc space-y-1 pl-5">
                      {insights.whatsWorking.map((x) => (
                        <li key={x}>{x}</li>
                      ))}
                    </ul>
                  </Section>
                  <Section icon={Target} title="What isn't">
                    <ul className="list-disc space-y-1 pl-5">
                      {insights.whatsNot.map((x) => (
                        <li key={x}>{x}</li>
                      ))}
                    </ul>
                  </Section>
                </div>
                <Section icon={Lightbulb} title="Do this next">
                  {insights.recommendations.map((r) => (
                    <div key={r.title}>
                      <div className="flex items-center gap-2 font-medium">
                        {r.title}
                        <Badge variant="secondary" className={RELEVANCE[r.impact]}>
                          {r.impact} impact
                        </Badge>
                      </div>
                      <p className="text-muted-foreground">{r.detail}</p>
                    </div>
                  ))}
                </Section>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Ideas for next week</CardTitle>
                    <CardDescription>Turn any of these into a post in AI Studio.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ul className="list-disc space-y-1 pl-5 text-sm">
                      {insights.nextWeekIdeas.map((x) => (
                        <li key={x}>{x}</li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>
        </Tabs>
      )}
    </>
  );
}
