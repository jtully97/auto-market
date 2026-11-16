'use client';

import { CREDIT_PACKS, PLANS } from '@automarket/shared';
import { Coins, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { on } from '@/lib/events';

/** Global: any PLAN_LIMIT / INSUFFICIENT_CREDITS error from the API opens this. */
export function UpgradeDialog() {
  const [state, setState] = useState<{ message: string; code: string } | null>(null);
  useEffect(() => on('upgrade-required', setState), []);
  const credits = state?.code === 'INSUFFICIENT_CREDITS';

  return (
    <Dialog open={Boolean(state)} onOpenChange={(open) => !open && setState(null)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {credits ? (
              <Coins className="size-5 text-amber-500" />
            ) : (
              <Sparkles className="size-5 text-violet-500" />
            )}
            {credits ? 'You need more credits' : 'Upgrade to unlock this'}
          </DialogTitle>
          <DialogDescription>{state?.message}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2 text-sm">
          {credits
            ? CREDIT_PACKS.map((p) => (
                <div key={p.id} className="flex items-center justify-between rounded-lg border p-3">
                  <span className="font-medium">{p.name}</span>
                  <span className="text-muted-foreground">${(p.price / 100).toFixed(0)}</span>
                </div>
              ))
            : Object.values(PLANS)
                .filter((p) => p.priceMonthly > 0)
                .map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <div>
                      <div className="font-medium">{p.name}</div>
                      <div className="text-muted-foreground text-xs">
                        {p.monthlyCredits.toLocaleString()} credits / mo · {p.limits.socialAccounts}{' '}
                        channels
                      </div>
                    </div>
                    <span className="text-muted-foreground">${p.priceMonthly / 100}/mo</span>
                  </div>
                ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setState(null)}>
            Not now
          </Button>
          <Button asChild onClick={() => setState(null)}>
            <Link href="/settings?tab=billing">{credits ? 'Buy credits' : 'See plans'}</Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
