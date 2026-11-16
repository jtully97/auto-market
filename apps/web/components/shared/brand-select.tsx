'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Brand } from '@/lib/api/types';

export function BrandSelect({
  brands,
  value,
  onChange,
}: {
  brands: Brand[];
  value?: string;
  onChange: (id: string) => void;
}) {
  if (brands.length <= 1) return null;
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-48" aria-label="Brand">
        <SelectValue placeholder="Choose brand" />
      </SelectTrigger>
      <SelectContent>
        {brands.map((b) => (
          <SelectItem key={b.id} value={b.id}>
            {b.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
