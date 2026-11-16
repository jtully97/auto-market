'use client';

import type { Platform } from '@automarket/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Clock, Loader2, Plus, Trash2, Unplug } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useSession } from '@/components/providers/session';
import { PageHeader } from '@/components/shared/page-header';
import { PlatformIcon } from '@/components/shared/platform-icon';
import { StatusBadge } from '@/components/shared/status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { api } from '@/lib/api/client';
import { schedules, usePlatforms, useSchedules, useSocialAccounts } from '@/lib/api/resources';
import type { SocialAccount } from '@/lib/api/types';
import { useActiveBrand } from '@/lib/use-brand';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const ERRORS: Record<string, string> = {
  limit: 'You have reached the channel limit on your plan.',
  expired: 'That connection took too long. Please try again.',
  cancelled: 'Connection cancelled.',
  connect_failed:
    "We couldn't connect that account. Check you granted all permissions and try again.",
};

function ScheduleDialog({ accounts, brandId }: { accounts: SocialAccount[]; brandId: string }) {
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState<string[]>(['1', '3', '5']);
  const [time, setTime] = useState('10:00');
  const [ids, setIds] = useState<string[]>(accounts.map((a) => a.id));
  const create = schedules.useCreate();
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Plus className="size-4" /> Add posting time
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a posting time</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Field>
            <FieldLabel>Days</FieldLabel>
            <ToggleGroup type="multiple" variant="outline" value={days} onValueChange={setDays}>
              {DAYS.map((d, i) => (
                <ToggleGroupItem key={d} value={String(i)}>
                  {d}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </Field>
          <Field>
            <FieldLabel htmlFor="time">Time ({timezone})</FieldLabel>
            <Input
              id="time"
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="w-36"
            />
          </Field>
          <Field>
            <FieldLabel>Channels</FieldLabel>
            {accounts.map((a) => (
              <Label key={a.id} className="flex items-center gap-2 font-normal">
                <Checkbox
                  checked={ids.includes(a.id)}
                  onCheckedChange={(v) =>
                    setIds((x) => (v ? [...x, a.id] : x.filter((y) => y !== a.id)))
                  }
                />
                <PlatformIcon platform={a.platform} size="sm" /> {a.name}
              </Label>
            ))}
          </Field>
        </div>
        <DialogFooter>
          <Button
            disabled={!days.length || !ids.length || create.isPending}
            onClick={() =>
              create.mutate(
                {
                  brandId,
                  socialAccountIds: ids,
                  daysOfWeek: days.map(Number),
                  timeOfDay: time,
                  timezone,
                } as never,
                { onSuccess: () => (toast.success('Posting time added'), setOpen(false)) },
              )
            }
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function Channels() {
  const params = useSearchParams();
  const router = useRouter();
  const qc = useQueryClient();
  const { can } = useSession();
  const { brand } = useActiveBrand();
  const { data: platforms } = usePlatforms();
  const { data: accounts = [] } = useSocialAccounts();
  const { data: slots = [] } = useSchedules(brand?.id);
  const removeSlot = schedules.useRemove();

  useEffect(() => {
    const connected = params.get('connected');
    const error = params.get('error');
    if (connected) toast.success(`Connected ${params.get('count') ?? ''} ${connected} account(s)`);
    if (error) toast.error(ERRORS[error] ?? 'Something went wrong connecting that account');
    if (connected || error) {
      qc.invalidateQueries({ queryKey: ['social-accounts'] });
      router.replace('/channels');
    }
  }, [params, qc, router]);

  const connect = useMutation({
    mutationFn: (platform: Platform) =>
      api<{ url: string }>(`/social-accounts/connect/${platform.toLowerCase()}`, {
        method: 'POST',
        body: { brandId: brand?.id },
      }),
    onSuccess: ({ url }) => (window.location.href = url),
  });
  const disconnect = useMutation({
    mutationFn: (id: string) => api(`/social-accounts/${id}`, { method: 'DELETE' }),
    onSuccess: () => (
      qc.invalidateQueries({ queryKey: ['social-accounts'] }),
      toast.success('Disconnected')
    ),
  });

  return (
    <>
      <PageHeader
        title="Channels"
        description="Connect your accounts once. AutoMarket posts to them for you."
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {platforms?.map((p) => (
          <Card key={p.platform} className="py-4">
            <CardContent className="flex items-center gap-3">
              <PlatformIcon platform={p.platform} size="lg" />
              <div className="flex-1">
                <div className="font-medium">{p.label}</div>
                <div className="text-muted-foreground text-xs">
                  {accounts.filter((a) => a.platform === p.platform).length} connected
                </div>
              </div>
              {p.configured ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!can('ADMIN') || connect.isPending}
                  onClick={() => connect.mutate(p.platform)}
                >
                  {connect.isPending && connect.variables === p.platform ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Plus className="size-4" />
                  )}{' '}
                  Connect
                </Button>
              ) : (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span>
                      <Button size="sm" variant="outline" disabled>
                        Soon
                      </Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>Your admin needs to add {p.label} app credentials</TooltipContent>
                </Tooltip>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Connected accounts</CardTitle>
        </CardHeader>
        <CardContent className="divide-y">
          {accounts.length === 0 && (
            <p className="text-muted-foreground text-sm">
              Nothing connected yet — pick a platform above.
            </p>
          )}
          {accounts.map((a) => (
            <div key={a.id} className="flex items-center gap-3 py-3">
              <PlatformIcon platform={a.platform} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{a.name}</div>
                <div className="text-muted-foreground truncate text-xs">
                  {a.handle ? `@${a.handle}` : a.lastError}
                </div>
              </div>
              <StatusBadge status={a.status} />
              {a.status !== 'CONNECTED' && (
                <Button size="sm" onClick={() => connect.mutate(a.platform)}>
                  Reconnect
                </Button>
              )}
              {can('ADMIN') && (
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`Disconnect ${a.name}`}
                  onClick={() => disconnect.mutate(a.id)}
                >
                  <Unplug className="size-4" />
                </Button>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {brand && accounts.length > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="size-4" /> Posting schedule
            </CardTitle>
            <CardDescription>
              Posts you &quot;Add to queue&quot; fill these slots automatically — set it and forget
              it.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {slots.length === 0 && (
              <p className="text-muted-foreground text-sm">
                No posting times yet. Tip: 3× a week at 10:00 is a great start.
              </p>
            )}
            {slots.map((s) => (
              <div key={s.id} className="flex items-center gap-3 rounded-lg border p-3 text-sm">
                <span className="font-medium tabular-nums">{s.timeOfDay}</span>
                <span>{s.daysOfWeek.map((d) => DAYS[d]).join(', ')}</span>
                <span className="text-muted-foreground text-xs">{s.timezone}</span>
                <span className="flex flex-1 justify-end -space-x-1">
                  {s.socialAccountIds.map((id) => {
                    const a = accounts.find((x) => x.id === id);
                    return a ? (
                      <PlatformIcon
                        key={id}
                        platform={a.platform}
                        size="sm"
                        className="ring-background ring-2"
                      />
                    ) : null;
                  })}
                </span>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label="Remove time"
                  onClick={() => removeSlot.mutate(s.id)}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            ))}
            <ScheduleDialog
              accounts={accounts.filter((a) => a.status === 'CONNECTED')}
              brandId={brand.id}
            />
          </CardContent>
        </Card>
      )}
    </>
  );
}
