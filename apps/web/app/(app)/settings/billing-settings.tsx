'use client';

import { CREDIT_PACKS } from '@automarket/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Coins, CreditCard, ExternalLink, Loader2 } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import { toast } from 'sonner';
import { useSession } from '@/components/providers/session';
import { PricingPlans } from '@/components/shared/pricing-plans';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { api } from '@/lib/api/client';
import { useCreditHistory, useCreditPricing, useWorkspace } from '@/lib/api/resources';
import { money } from '@/lib/format';

const METER_LABELS = {
  scheduledPosts: 'Scheduled posts this month',
  emailsSent: 'Emails sent this month',
  socialAccounts: 'Social channels',
  contacts: 'Contacts',
  brands: 'Brands',
  seats: 'Team seats',
} as const;

const redirectTo = ({ url }: { url: string | null }) => url && (window.location.href = url);

export function BillingSettings() {
  const params = useSearchParams();
  const { can } = useSession();
  const { data: ws, refetch } = useWorkspace();
  const { data: history } = useCreditHistory();
  const { data: pricing } = useCreditPricing();
  const invoices = useQuery({
    queryKey: ['invoices'],
    queryFn: () =>
      api<
        {
          id: string;
          number: string;
          total: number;
          status: string;
          created: string;
          url: string;
        }[]
      >('/billing/invoices'),
    enabled: can('ADMIN'),
  });

  useEffect(() => {
    if (params.get('success')) toast.success('Welcome aboard! Your plan is active.');
    if (params.get('credits'))
      toast.success(`${Number(params.get('credits')).toLocaleString()} credits added`);
    if (params.get('changed')) toast.success('Plan updated');
    if (params.get('success') || params.get('credits') || params.get('changed')) void refetch();
  }, [params, refetch]);

  const checkout = useMutation({
    mutationFn: (b: { planId: string; interval: string }) =>
      api<{ url: string }>('/billing/checkout', { method: 'POST', body: b }),
    onSuccess: redirectTo,
  });
  const buyPack = useMutation({
    mutationFn: (packId: string) =>
      api<{ url: string }>('/billing/credits/checkout', { method: 'POST', body: { packId } }),
    onSuccess: redirectTo,
  });
  const portal = useMutation({
    mutationFn: () => api<{ url: string }>('/billing/portal', { method: 'POST' }),
    onSuccess: redirectTo,
  });

  if (!ws) return null;
  const c = ws.credits;

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="size-4" /> {ws.plan.name} plan
            </CardTitle>
            <CardDescription>
              {ws.subscriptionStatus === 'ACTIVE' || ws.subscriptionStatus === 'TRIALING'
                ? `${ws.cancelAtPeriodEnd ? 'Ends' : 'Renews'} ${ws.currentPeriodEnd ? format(new Date(ws.currentPeriodEnd), 'PP') : ''} · billed ${ws.billingInterval === 'year' ? 'yearly' : 'monthly'}`
                : ws.subscriptionStatus === 'PAST_DUE'
                  ? 'Payment failed — update your card to keep your plan'
                  : 'Free forever. Upgrade any time.'}
            </CardDescription>
            {ws.planId !== 'free' && can('OWNER') && (
              <CardAction>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => portal.mutate()}
                  disabled={portal.isPending}
                >
                  Manage billing <ExternalLink className="size-3.5" />
                </Button>
              </CardAction>
            )}
          </CardHeader>
          <CardContent className="space-y-3">
            {(Object.keys(METER_LABELS) as (keyof typeof METER_LABELS)[]).map((k) => {
              const m = ws.usage.meters[k];
              return (
                <div key={k} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span>{METER_LABELS[k]}</span>
                    <span className="text-muted-foreground tabular-nums">
                      {m.used.toLocaleString()} /{' '}
                      {m.limit === null ? '∞' : m.limit.toLocaleString()}
                    </span>
                  </div>
                  {m.limit !== null && <Progress value={Math.min(100, (m.used / m.limit) * 100)} />}
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Coins className="size-4 text-amber-500" /> AI credits
            </CardTitle>
            <CardDescription>
              Monthly credits reset each billing period. Purchased credits last 12 months and are
              used after monthly ones.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-end gap-6">
              <div>
                <div className="text-3xl font-semibold tabular-nums">
                  {c.available.toLocaleString()}
                </div>
                <div className="text-muted-foreground text-xs">available</div>
              </div>
              <div className="text-muted-foreground text-sm">
                {c.subscription.toLocaleString()} monthly · {c.pack.toLocaleString()} purchased
                {c.held ? ` · ${c.held} in use` : ''}
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              {CREDIT_PACKS.map((p) => (
                <Button
                  key={p.id}
                  variant="outline"
                  className="h-auto flex-col py-3"
                  disabled={!can('ADMIN') || buyPack.isPending}
                  onClick={() => buyPack.mutate(p.id)}
                >
                  {buyPack.isPending && buyPack.variables === p.id ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <span className="font-semibold">{p.credits.toLocaleString()}</span>
                  )}
                  <span className="text-muted-foreground text-xs">{money(p.price)}</span>
                </Button>
              ))}
            </div>
            <details className="text-sm">
              <summary className="text-muted-foreground cursor-pointer">
                What does each AI action cost?
              </summary>
              <ul className="mt-2 grid gap-1 sm:grid-cols-2">
                {pricing?.actions.map((a) => (
                  <li key={a.action} className="flex justify-between gap-2">
                    <span>{a.label}</span>
                    <span className="tabular-nums">{a.credits}</span>
                  </li>
                ))}
              </ul>
            </details>
          </CardContent>
        </Card>
      </div>

      {can('OWNER') && (
        <Card>
          <CardHeader>
            <CardTitle>Plans</CardTitle>
          </CardHeader>
          <CardContent>
            <PricingPlans
              currentPlanId={ws.planId}
              busyPlan={checkout.isPending ? checkout.variables?.planId : null}
              onSelect={(planId, interval) => checkout.mutate({ planId, interval })}
            />
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Credit activity</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Activity</TableHead>
                  <TableHead className="text-right">Credits</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history?.items.slice(0, 15).map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                      {format(new Date(t.createdAt), 'MMM d, p')}
                    </TableCell>
                    <TableCell className="text-sm">{t.description}</TableCell>
                    <TableCell
                      className={`text-right tabular-nums ${t.amount > 0 ? 'text-emerald-600' : ''}`}
                    >
                      {t.amount > 0 ? '+' : ''}
                      {t.amount}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        {can('ADMIN') && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Invoices</CardTitle>
            </CardHeader>
            <CardContent>
              {invoices.data?.length === 0 && (
                <p className="text-muted-foreground text-sm">No invoices yet.</p>
              )}
              <Table>
                <TableBody>
                  {invoices.data?.map((i) => (
                    <TableRow key={i.id}>
                      <TableCell>{format(new Date(i.created), 'PP')}</TableCell>
                      <TableCell className="text-muted-foreground">{i.number}</TableCell>
                      <TableCell className="tabular-nums">{money(i.total)}</TableCell>
                      <TableCell className="text-right">
                        <a
                          href={i.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sm underline"
                        >
                          View
                        </a>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
