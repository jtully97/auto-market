import { Suspense } from 'react';
import { Composer } from './composer';

export const metadata = { title: 'Create post' };

export default function ComposePage() {
  return (
    <Suspense>
      <Composer />
    </Suspense>
  );
}
