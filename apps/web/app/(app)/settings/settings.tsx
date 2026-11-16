'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { PageHeader } from '@/components/shared/page-header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BillingSettings } from './billing-settings';
import { BrandSettings } from './brand-settings';
import { TeamSettings } from './team-settings';
import { WorkspaceSettings } from './workspace-settings';

export function Settings() {
  const tab = useSearchParams().get('tab') ?? 'brand';
  const router = useRouter();
  return (
    <>
      <PageHeader title="Settings" />
      <Tabs value={tab} onValueChange={(v) => router.replace(`/settings?tab=${v}`)}>
        <TabsList>
          <TabsTrigger value="brand">Brand & AI</TabsTrigger>
          <TabsTrigger value="billing">Billing & credits</TabsTrigger>
          <TabsTrigger value="team">Team</TabsTrigger>
          <TabsTrigger value="workspace">Workspace</TabsTrigger>
        </TabsList>
        <TabsContent value="brand" className="mt-6">
          <BrandSettings />
        </TabsContent>
        <TabsContent value="billing" className="mt-6">
          <BillingSettings />
        </TabsContent>
        <TabsContent value="team" className="mt-6">
          <TeamSettings />
        </TabsContent>
        <TabsContent value="workspace" className="mt-6">
          <WorkspaceSettings />
        </TabsContent>
      </Tabs>
    </>
  );
}
