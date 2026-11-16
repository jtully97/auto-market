import { Suspense } from 'react';
import { Settings } from './settings';

export const metadata = { title: 'Settings' };

export default function SettingsPage() {
  return (
    <Suspense>
      <Settings />
    </Suspense>
  );
}
