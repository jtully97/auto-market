'use client';

import { creditsFor, type EmailCampaignInput } from '@automarket/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Loader2, Send, Sparkles, TestTube2 } from 'lucide-react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { useSession } from '@/components/providers/session';
import { CreditCost } from '@/components/shared/credit-cost';
import { PageHeader } from '@/components/shared/page-header';
import { StatCard } from '@/components/shared/stat-card';
import { StatusBadge } from '@/components/shared/status-badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api/client';
import { campaigns, contactLists } from '@/lib/api/resources';
import type { AiGeneration, Campaign, EmailOutput } from '@/lib/api/types';
import { percent } from '@/lib/format';
import { useActiveBrand } from '@/lib/use-brand';

const STARTER = `<div style="font-family:system-ui,sans-serif;max-width:600px;margin:auto;padding:24px;color:#111">
  <h1 style="font-size:24px">Hi {{firstName|there}},</h1>
  <p style="font-size:16px;line-height:1.6">Write your message here.</p>
  <p><a href="https://example.com" style="display:inline-block;background:#6d28d9;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none">Shop now</a></p>
</div>`;

type Draft = Omit<EmailCampaignInput, 'scheduledAt' | 'design'>;

export function CampaignEditor() {
  const { id } = useParams<{ id: string }>();
  const isNew = id === 'new';
  const fromGeneration = useSearchParams().get('fromGeneration');
  const { brand } = useActiveBrand();
  const { data: existing } = campaigns.useOne(isNew ? null : id);
  const { data: generation, isLoading: generationLoading } = useQuery({
    queryKey: ['generations', 'one', fromGeneration],
    queryFn: () => api<AiGeneration<EmailOutput>>(`/ai/generations/${fromGeneration}`),
    enabled: Boolean(fromGeneration),
  });

  const ready = isNew
    ? Boolean(brand) && !(fromGeneration && generationLoading)
    : Boolean(existing);
  if (!ready) {
    return (
      <div className="text-muted-foreground flex items-center gap-2 text-sm">
        <Loader2 className="size-4 animate-spin" /> Loading campaign…
      </div>
    );
  }

  const e = generation?.output;
  const initial: Draft = existing
    ? {
        brandId: existing.brandId,
        name: existing.name,
        subject: existing.subject,
        previewText: existing.previewText ?? '',
        fromName: existing.fromName,
        replyTo: existing.replyTo ?? undefined,
        html: existing.html,
        listIds: existing.listIds,
      }
    : {
        brandId: brand!.id,
        name: e?.subjectLines[0] ?? '',
        subject: e?.subjectLines[0] ?? '',
        previewText: e?.previewText ?? '',
        fromName: brand!.name,
        html: e?.html ?? STARTER,
        listIds: [],
      };
  // Keyed so the form initialises once per campaign instead of syncing state in effects.
  return <CampaignForm key={existing?.id ?? 'new'} id={id} existing={existing} initial={initial} />;
}

function CampaignForm({
  id,
  existing,
  initial,
}: {
  id: string;
  existing?: Campaign;
  initial: Draft;
}) {
  const isNew = id === 'new';
  const router = useRouter();
  const { me } = useSession();
  const qc = useQueryClient();
  const { data: lists } = contactLists.useList({ pageSize: 100 });

  const [draft, setDraft] = useState<Draft>(initial);
  const [brief, setBrief] = useState('');
  const [sendAt, setSendAt] = useState('');
  const [testTo, setTestTo] = useState(me.email);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  const recipients = useQuery({
    queryKey: ['campaign-recipients', draft.listIds],
    queryFn: () =>
      api<{
        recipients: number;
        quotaRemaining: number;
        overageEmails: number;
        overageCredits: number;
      }>('/campaigns/recipients', { method: 'POST', body: { listIds: draft.listIds } }),
    enabled: draft.listIds.length > 0,
  });

  const aiDraft = useMutation({
    mutationFn: () =>
      api<AiGeneration<EmailOutput>>('/ai/text', {
        method: 'POST',
        body: { brandId: draft.brandId, kind: 'email', prompt: brief },
      }),
    onSuccess: (g) => {
      setDraft((d) => ({
        ...d,
        subject: g.output.subjectLines[0] ?? d.subject,
        previewText: g.output.previewText,
        html: g.output.html,
        name: d.name || g.output.subjectLines[0] || '',
      }));
      qc.invalidateQueries({ queryKey: ['credits'] });
      toast.success('Draft written — review and tweak it');
    },
  });

  const save = useMutation({
    mutationFn: () =>
      isNew
        ? api<Campaign>('/campaigns', { method: 'POST', body: draft })
        : api<Campaign>(`/campaigns/${id}`, { method: 'PUT', body: draft }),
    onSuccess: (c) => {
      qc.invalidateQueries({ queryKey: ['campaigns'] });
      if (isNew) router.replace(`/email/campaigns/${c.id}`);
      toast.success('Saved');
    },
  });
  const ensureSaved = () => save.mutateAsync();
  const test = useMutation({
    mutationFn: async () => {
      const c = await ensureSaved();
      return api(`/campaigns/${c.id}/test`, {
        method: 'POST',
        body: {
          to: testTo
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
        },
      });
    },
    onSuccess: () => toast.success('Test email sent'),
  });
  const schedule = useMutation({
    mutationFn: async () => {
      const c = await ensureSaved();
      return api<Campaign>(`/campaigns/${c.id}/schedule`, {
        method: 'POST',
        body: { scheduledAt: sendAt ? new Date(sendAt) : null },
      });
    },
    onSuccess: (c) => {
      qc.invalidateQueries({ queryKey: ['campaigns'] });
      toast.success(
        sendAt ? `Scheduled for ${format(new Date(c.scheduledAt!), 'PPp')}` : 'Sending now',
      );
      router.push('/email');
    },
  });
  const cancel = useMutation({
    mutationFn: () => api(`/campaigns/${id}/cancel`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['campaigns'] }),
  });

  const locked = existing && !['DRAFT', 'SCHEDULED'].includes(existing.status);
  const valid = draft.name && draft.subject && draft.fromName && draft.html && draft.listIds.length;

  if (locked && existing) {
    return (
      <>
        <PageHeader
          title={existing.name}
          description={existing.subject}
          actions={<StatusBadge status={existing.status} />}
        />
        <div className="grid gap-4 sm:grid-cols-4">
          <StatCard label="Recipients" value={existing.recipientsCount.toLocaleString()} />
          <StatCard label="Sent" value={existing.sentCount.toLocaleString()} />
          <StatCard
            label="Open rate"
            value={existing.sentCount ? percent(existing.openCount / existing.sentCount) : '—'}
          />
          <StatCard
            label="Click rate"
            value={existing.sentCount ? percent(existing.clickCount / existing.sentCount) : '—'}
            hint={`${existing.unsubscribeCount} unsubscribed`}
          />
        </div>
        {existing.status === 'SENDING' && (
          <Button variant="outline" className="mt-4" onClick={() => cancel.mutate()}>
            Stop sending
          </Button>
        )}
        <iframe
          title="Email"
          sandbox=""
          srcDoc={existing.html}
          className="mt-6 h-[600px] w-full rounded-xl border bg-white"
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={isNew ? 'New campaign' : draft.name || 'Campaign'}
        description="Personalize with {{firstName}}. An unsubscribe link and your address are added automatically."
        actions={
          <>
            {existing?.status === 'SCHEDULED' && (
              <Button variant="outline" onClick={() => cancel.mutate()}>
                Unschedule
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => save.mutate()}
              disabled={save.isPending || !valid}
            >
              Save draft
            </Button>
          </>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <Card>
            <CardContent>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="name">Campaign name (internal)</FieldLabel>
                  <Input
                    id="name"
                    value={draft.name}
                    onChange={(e) => set('name', e.target.value)}
                    placeholder="November newsletter"
                  />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="subject">Subject line</FieldLabel>
                    <Input
                      id="subject"
                      value={draft.subject}
                      onChange={(e) => set('subject', e.target.value)}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="preview">Preview text</FieldLabel>
                    <Input
                      id="preview"
                      value={draft.previewText ?? ''}
                      onChange={(e) => set('previewText', e.target.value)}
                      placeholder="Shown next to the subject in inboxes"
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="from">From name</FieldLabel>
                    <Input
                      id="from"
                      value={draft.fromName}
                      onChange={(e) => set('fromName', e.target.value)}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="reply">Reply-to email</FieldLabel>
                    <Input
                      id="reply"
                      type="email"
                      value={draft.replyTo ?? ''}
                      onChange={(e) => set('replyTo', e.target.value || undefined)}
                      placeholder="you@business.com"
                    />
                  </Field>
                </div>
              </FieldGroup>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Content</CardTitle>
              <CardDescription>
                Let AI write it, then edit the HTML or just preview.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  value={brief}
                  onChange={(e) => setBrief(e.target.value)}
                  placeholder="What's this email about?"
                  className="min-w-60 flex-1"
                />
                <Button
                  variant="outline"
                  onClick={() => aiDraft.mutate()}
                  disabled={!brief.trim() || aiDraft.isPending || !draft.brandId}
                >
                  {aiDraft.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Sparkles className="size-4" />
                  )}{' '}
                  Write with AI
                </Button>
                <CreditCost credits={creditsFor('text.email')} />
              </div>
              <Tabs defaultValue="preview">
                <TabsList>
                  <TabsTrigger value="preview">Preview</TabsTrigger>
                  <TabsTrigger value="html">HTML</TabsTrigger>
                </TabsList>
                <TabsContent value="preview">
                  <iframe
                    title="Email preview"
                    sandbox=""
                    srcDoc={draft.html}
                    className="h-[520px] w-full rounded-lg border bg-white"
                  />
                </TabsContent>
                <TabsContent value="html">
                  <Textarea
                    rows={22}
                    value={draft.html}
                    onChange={(e) => set('html', e.target.value)}
                    className="font-mono text-xs"
                  />
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Audience</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {lists?.items.length === 0 && (
                <p className="text-muted-foreground text-sm">
                  Create a list on the Contacts page first.
                </p>
              )}
              {lists?.items.map((l) => (
                <Label key={l.id} className="flex items-center gap-2 font-normal">
                  <Checkbox
                    checked={draft.listIds.includes(l.id)}
                    onCheckedChange={(on) =>
                      set(
                        'listIds',
                        on ? [...draft.listIds, l.id] : draft.listIds.filter((x) => x !== l.id),
                      )
                    }
                  />
                  <span className="flex-1">{l.name}</span>
                  <span className="text-muted-foreground text-xs tabular-nums">
                    {l.memberCount.toLocaleString()}
                  </span>
                </Label>
              ))}
              {recipients.data && (
                <p className="text-sm">
                  <b>{recipients.data.recipients.toLocaleString()}</b> subscribed recipients
                </p>
              )}
              {!!recipients.data?.overageEmails && (
                <Alert>
                  <AlertDescription>
                    {recipients.data.overageEmails.toLocaleString()} emails exceed your monthly
                    quota and will use <b>{recipients.data.overageCredits} credits</b>.
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Send</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Field>
                <FieldLabel htmlFor="sendAt">Send time</FieldLabel>
                <Input
                  id="sendAt"
                  type="datetime-local"
                  value={sendAt}
                  onChange={(e) => setSendAt(e.target.value)}
                />
                <FieldDescription>Leave empty to send right away.</FieldDescription>
              </Field>
              <div className="flex gap-2">
                <Dialog>
                  <DialogTrigger asChild>
                    <Button variant="outline" disabled={!valid}>
                      <TestTube2 className="size-4" /> Send test
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Send a test email</DialogTitle>
                    </DialogHeader>
                    <Input
                      value={testTo}
                      onChange={(e) => setTestTo(e.target.value)}
                      placeholder="Comma-separated emails"
                    />
                    <DialogFooter>
                      <Button onClick={() => test.mutate()} disabled={test.isPending}>
                        {test.isPending && <Loader2 className="size-4 animate-spin" />} Send test
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
                <Button
                  className="flex-1"
                  disabled={!valid || schedule.isPending || !recipients.data?.recipients}
                  onClick={() => schedule.mutate()}
                >
                  {schedule.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Send className="size-4" />
                  )}{' '}
                  {sendAt ? 'Schedule' : 'Send now'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
