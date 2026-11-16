import { Suspense } from 'react';
import { Studio } from './studio';

export const metadata = { title: 'AI Studio' };

export default function StudioPage() {
  return (
    <Suspense>
      <Studio />
    </Suspense>
  );
}
