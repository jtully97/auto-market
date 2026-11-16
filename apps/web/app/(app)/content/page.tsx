import { Suspense } from 'react';
import { ContentQueue } from './content-queue';

export const metadata = { title: 'Content queue' };

export default function ContentPage() {
  return (
    <Suspense>
      <ContentQueue />
    </Suspense>
  );
}
