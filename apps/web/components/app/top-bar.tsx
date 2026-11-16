'use client';

import { Coins, Moon, PenSquare, Sun } from 'lucide-react';
import Link from 'next/link';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useCredits } from '@/lib/api/resources';

export function TopBar() {
  const { data: credits } = useCredits();
  const { resolvedTheme, setTheme } = useTheme();
  return (
    <header className="bg-background/80 sticky top-0 z-20 flex h-14 items-center gap-2 border-b px-4 backdrop-blur">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-2 h-4" />
      <div className="flex-1" />
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="outline" size="sm" asChild>
            <Link href="/settings?tab=billing">
              <Coins className="size-4 text-amber-500" />
              <span className="tabular-nums">
                {credits ? credits.available.toLocaleString() : '—'}
              </span>
              <span className="text-muted-foreground hidden sm:inline">credits</span>
            </Link>
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {credits
            ? `${credits.subscription.toLocaleString()} monthly · ${credits.pack.toLocaleString()} purchased`
            : 'AI credits'}
        </TooltipContent>
      </Tooltip>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Toggle theme"
        onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
      >
        <Sun className="size-4 dark:hidden" />
        <Moon className="hidden size-4 dark:block" />
      </Button>
      <Button size="sm" asChild>
        <Link href="/compose">
          <PenSquare className="size-4" /> Create post
        </Link>
      </Button>
    </header>
  );
}
