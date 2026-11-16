'use client';

import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ApiError } from '@/lib/api/client';
import { emit } from '@/lib/events';

const handleError = (error: unknown) => {
  if (error instanceof ApiError && error.isPlanLimit) {
    emit('upgrade-required', { message: error.message, code: error.code });
    return;
  }
  if (error instanceof ApiError && error.status === 401) return;
  toast.error(error instanceof Error ? error.message : 'Something went wrong');
};

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 2,
            refetchOnWindowFocus: false,
          },
        },
        queryCache: new QueryCache({
          onError: (err, query) => !query.meta?.silent && handleError(err),
        }),
        mutationCache: new MutationCache({
          onError: (err, _v, _c, mutation) => !mutation.meta?.silent && handleError(err),
        }),
      }),
  );
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <QueryClientProvider client={client}>
        <TooltipProvider delayDuration={200}>{children}</TooltipProvider>
        <Toaster richColors position="top-right" />
      </QueryClientProvider>
    </ThemeProvider>
  );
}
