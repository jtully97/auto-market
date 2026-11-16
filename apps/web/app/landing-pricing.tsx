'use client';

import { useRouter } from 'next/navigation';
import { PricingPlans } from '@/components/shared/pricing-plans';

export function LandingPricing() {
  const router = useRouter();
  return (
    <PricingPlans
      onSelect={(planId, interval) => router.push(`/register?plan=${planId}&interval=${interval}`)}
    />
  );
}
