'use client';

import { Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { SessionProvider } from '@/components/providers/session';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { AppSidebar } from './app-sidebar';
import { TopBar } from './top-bar';
import { UpgradeDialog } from './upgrade-dialog';

const Loading = () => (
  <div className="text-muted-foreground flex h-dvh items-center justify-center gap-2 text-sm">
    <Loader2 className="size-4 animate-spin" /> Loading your workspace…
  </div>
);

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <SessionProvider fallback={<Loading />}>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <TopBar />
          <main className="mx-auto w-full max-w-7xl flex-1 p-4 md:p-8">{children}</main>
        </SidebarInset>
        <UpgradeDialog />
      </SidebarProvider>
    </SessionProvider>
  );
}
