import { Suspense } from 'react';
import { CampaignEditor } from './campaign-editor';

export default function CampaignPage() {
  return (
    <Suspense>
      <CampaignEditor />
    </Suspense>
  );
}
