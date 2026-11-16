'use client';

import { brandProfileSchema, type BrandProfileInput } from '@automarket/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { Bot, Sparkles } from 'lucide-react';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { useSession } from '@/components/providers/session';
import { BrandSelect } from '@/components/shared/brand-select';
import { FormField } from '@/components/shared/form-field';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FieldGroup } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { brands as brandsResource } from '@/lib/api/resources';
import type { Brand } from '@/lib/api/types';
import { useActiveBrand } from '@/lib/use-brand';

const toForm = (b: Brand): BrandProfileInput => ({
  name: b.name,
  website: b.website ?? '',
  industry: b.industry ?? '',
  niche: b.niche ?? '',
  description: b.description ?? '',
  targetAudience: b.targetAudience ?? '',
  voice: b.voice ?? '',
  competitors: b.competitors,
  goals: b.goals,
  keywords: b.keywords,
  avoidTopics: b.avoidTopics,
  aiOptIn: b.aiOptIn,
  autopilotEnabled: b.autopilotEnabled,
});

/** Comma-separated list input bound to a string[] field. */
const ListInput = ({
  value,
  onChange,
  ...rest
}: {
  value: unknown;
  onChange: (v: unknown) => void;
  placeholder?: string;
  id: string;
}) => (
  <Input
    {...rest}
    defaultValue={((value as string[]) ?? []).join(', ')}
    onBlur={(e) =>
      onChange(
        e.target.value
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      )
    }
  />
);

export function BrandSettings() {
  const { brand, brands, setBrandId } = useActiveBrand();
  if (!brand) return null;
  // Keyed so switching brands remounts the form with fresh defaults.
  return <BrandForm key={brand.id} brand={brand} brands={brands} setBrandId={setBrandId} />;
}

function BrandForm({
  brand,
  brands,
  setBrandId,
}: {
  brand: Brand;
  brands: Brand[];
  setBrandId: (id: string) => void;
}) {
  const { can } = useSession();
  const update = brandsResource.useUpdate();
  const form = useForm<BrandProfileInput>({
    resolver: zodResolver(brandProfileSchema) as never,
    defaultValues: toForm(brand),
  });
  const save = form.handleSubmit((v) =>
    update.mutate({ id: brand.id, ...v }, { onSuccess: () => toast.success('Brand saved') }),
  );
  const aiOn = useWatch({ control: form.control, name: 'aiOptIn' });

  return (
    <form onSubmit={save} className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-sm">
          The more the AI knows about your lane, the better (and less generic) your content gets.
        </p>
        <BrandSelect brands={brands} value={brand.id} onChange={setBrandId} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-violet-500" /> AI content
          </CardTitle>
          <CardDescription>
            Opt in to AI-written captions, images, video and analysis for this brand. You can turn
            it off any time.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <FormField control={form.control} name="aiOptIn">
            {(f) => (
              <label className="flex items-center justify-between gap-4 rounded-lg border p-4">
                <div>
                  <div className="font-medium">Use AI for {brand.name}</div>
                  <div className="text-muted-foreground text-sm">
                    AI actions use credits and always show the cost first.
                  </div>
                </div>
                <Switch checked={Boolean(f.value)} onCheckedChange={f.onChange} />
              </label>
            )}
          </FormField>
          <FormField control={form.control} name="autopilotEnabled">
            {(f) => (
              <label
                className={`flex items-center justify-between gap-4 rounded-lg border p-4 ${aiOn ? '' : 'opacity-50'}`}
              >
                <div>
                  <div className="flex items-center gap-2 font-medium">
                    <Bot className="size-4" /> Autopilot
                  </div>
                  <div className="text-muted-foreground text-sm">
                    Every week the AI drafts next week&apos;s posts and emails you to approve them.
                    Nothing posts without your OK.
                  </div>
                </div>
                <Switch checked={Boolean(f.value)} onCheckedChange={f.onChange} disabled={!aiOn} />
              </label>
            )}
          </FormField>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Brand profile</CardTitle>
          <CardDescription>Used by the AI analyst and every generation.</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField control={form.control} name="name" label="Brand name">
                {(f) => <Input {...f} value={(f.value as string) ?? ''} />}
              </FormField>
              <FormField control={form.control} name="website" label="Website">
                {(f) => <Input {...f} value={(f.value as string) ?? ''} placeholder="https://" />}
              </FormField>
              <FormField control={form.control} name="industry" label="Industry">
                {(f) => (
                  <Input
                    {...f}
                    value={(f.value as string) ?? ''}
                    placeholder="e.g. Fitness, SaaS, Real estate"
                  />
                )}
              </FormField>
              <FormField control={form.control} name="niche" label="Niche / lane">
                {(f) => (
                  <Input
                    {...f}
                    value={(f.value as string) ?? ''}
                    placeholder="e.g. Postpartum fitness coaching for busy moms"
                  />
                )}
              </FormField>
            </div>
            <FormField
              control={form.control}
              name="description"
              label="What you sell and why it's different"
            >
              {(f) => <Textarea {...f} value={(f.value as string) ?? ''} rows={3} />}
            </FormField>
            <FormField control={form.control} name="targetAudience" label="Who your customers are">
              {(f) => <Textarea {...f} value={(f.value as string) ?? ''} rows={2} />}
            </FormField>
            <FormField
              control={form.control}
              name="voice"
              label="Brand voice"
              description="e.g. Warm and witty, never salesy. Uses emojis sparingly."
            >
              {(f) => <Input {...f} value={(f.value as string) ?? ''} />}
            </FormField>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="competitors"
                label="Competitors"
                description="Comma separated"
              >
                {(f) => <ListInput {...f} />}
              </FormField>
              <FormField
                control={form.control}
                name="goals"
                label="Marketing goals"
                description="Comma separated"
              >
                {(f) => <ListInput {...f} />}
              </FormField>
              <FormField control={form.control} name="keywords" label="Keywords">
                {(f) => <ListInput {...f} />}
              </FormField>
              <FormField control={form.control} name="avoidTopics" label="Topics to avoid">
                {(f) => <ListInput {...f} />}
              </FormField>
            </div>
          </FieldGroup>
        </CardContent>
      </Card>
      <div className="flex justify-end">
        <Button type="submit" disabled={!can('EDITOR') || update.isPending}>
          Save brand
        </Button>
      </div>
    </form>
  );
}
