import { Suspense } from 'react';
import { AcceptInvite } from './accept-invite';

export default function InvitePage() {
  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <Suspense>
        <AcceptInvite />
      </Suspense>
    </div>
  );
}
