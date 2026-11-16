'use client';

import { useState } from 'react';
import { brands } from './api/resources';
import type { Brand } from './api/types';

const KEY = 'am.brand';

/** The brand the user is working on, remembered across pages (falls back to the first brand). */
export function useActiveBrand() {
  const { data, isLoading } = brands.useList({ pageSize: 100 });
  const [brandId, setBrandIdState] = useState<string | null>(() =>
    typeof window === 'undefined' ? null : localStorage.getItem(KEY),
  );
  const list = data?.items ?? [];
  const brand: Brand | undefined = list.find((b) => b.id === brandId) ?? list[0];

  const setBrandId = (id: string) => {
    localStorage.setItem(KEY, id);
    setBrandIdState(id);
  };
  return { brand, brands: list, setBrandId, isLoading };
}
