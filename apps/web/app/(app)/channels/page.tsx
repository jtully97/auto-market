import { Suspense } from 'react';
import { Channels } from './channels';

export const metadata = { title: 'Channels' };

export default function ChannelsPage() {
  return (
    <Suspense>
      <Channels />
    </Suspense>
  );
}
