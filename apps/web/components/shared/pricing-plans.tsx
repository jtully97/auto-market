'use client';

import { PLANS, type BillingInterval, type PlanDefinition } from '@automarket/shared';
import { Check } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

const bullets = (p: PlanDefinition) =>
  [
    `${p.monthlyCredits.toLocaleString()} AI credits / month`,
    `${p.limits.socialAccounts} social channels`,
    p.limits.scheduledPostsPerMonth === null
      ? 'Unlimited scheduled posts'
      : `${p.limits.scheduledPostsPerMonth} scheduled posts / month`,
    `${p.limits.brands} brand${p.limits.brands > 1 ? 's' : ''} · ${p.limits.seats} seat${p.limits.seats > 1 ? 's' : ''}`,
    `${p.limits.contacts.toLocaleString()} contacts · ${p.limits.emailsPerMonth.toLocaleString()} emails / mo`,
    p.features.aiVideo ? 'AI video (Higgsfield)' : 'AI captions & images',
    p.features.aiAnalyst && 'AI niche analyst',
    p.features.approvalWorkflows && 'Approval workflows',
    p.features.advancedAnalytics && 'Full analytics history',
  ].filter(Boolean) as string[];

/** Shared by the public pricing page and in-app billing. */
export function PricingPlans({
  currentPlanId,
  onSelect,
  busyPlan,
}: {
  currentPlanId?: string;
  onSelect: (planId: PlanDefinition['id'], interval: BillingInterval) => void;
  busyPlan?: string | null;
}) {
  const [interval, setInterval] = useState<BillingInterval>('month');
  return (
    <div className="space-y-6">
      <div className="flex justify-center">
        <Tabs value={interval} onValueChange={(v) => setInterval(v as BillingInterval)}>
          <TabsList>
            <TabsTrigger value="month">Monthly</TabsTrigger>
            <TabsTrigger value="year">Yearly · 2 months free</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Object.values(PLANS).map((p) => {
          const price = interval === 'month' ? p.priceMonthly : Math.round(p.priceYearly / 12);
          const current = p.id === currentPlanId;
          return (
            <Card
              key={p.id}
              className={cn(
                'relative flex flex-col',
                p.highlighted && 'border-primary ring-primary/20 shadow-lg ring-2',
              )}
            >
              {p.highlighted && (
                <Badge className="absolute -top-2.5 left-1/2 -translate-x-1/2">Most popular</Badge>
              )}
              <CardHeader>
                <CardTitle>{p.name}</CardTitle>
                <CardDescription>{p.tagline}</CardDescription>
                <div className="pt-2">
                  <span className="text-3xl font-semibold">${(price / 100).toFixed(0)}</span>
                  <span className="text-muted-foreground text-sm">
                    /mo{interval === 'year' && p.priceYearly ? ', billed yearly' : ''}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="flex-1">
                <ul className="space-y-2 text-sm">
                  {bullets(p).map((b) => (
                    <li key={b} className="flex gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-emerald-500" /> {b}
                    </li>
                  ))}
                </ul>
              </CardContent>
              <CardFooter>
                <Button
                  className="w-full"
                  variant={p.highlighted ? 'default' : 'outline'}
                  disabled={current || p.id === 'free' || busyPlan === p.id}
                  onClick={() => onSelect(p.id, interval)}
                >
                  {current ? 'Current plan' : p.id === 'free' ? 'Free forever' : `Choose ${p.name}`}
                </Button>
              </CardFooter>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
