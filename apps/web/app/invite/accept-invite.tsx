'use client';

import { useMutation } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { api, setActiveWorkspace } from '@/lib/api/client';

export function AcceptInvite() {
  const token = useSearchParams().get('token') ?? '';
  const router = useRouter();
  const accept = useMutation({
    mutationFn: () =>
      api<{ workspaceId: string }>('/workspaces/invitations/accept', {
        method: 'POST',
        body: { token },
      }),
    onSuccess: ({ workspaceId }) => {
      setActiveWorkspace(workspaceId);
      router.replace('/dashboard');
    },
  });
  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Join your team on AutoMarket</CardTitle>
        <CardDescription>Accept the invitation to start collaborating.</CardDescription>
      </CardHeader>
      <CardContent>
        <Button
          className="w-full"
          onClick={() => accept.mutate()}
          disabled={!token || accept.isPending}
        >
          Accept invitation
        </Button>
      </CardContent>
    </Card>
  );
}
