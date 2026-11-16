'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { useSession } from '@/components/providers/session';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api/client';
import { useWorkspace } from '@/lib/api/resources';

export function WorkspaceSettings() {
  const { data: ws } = useWorkspace();
  if (!ws) return null;
  return <WorkspaceForm key={ws.id} initialName={ws.name} initialTimezone={ws.timezone} />;
}

function WorkspaceForm({
  initialName,
  initialTimezone,
}: {
  initialName: string;
  initialTimezone: string;
}) {
  const { can, switchWorkspace } = useSession();
  const qc = useQueryClient();
  const [name, setName] = useState(initialName);
  const [timezone, setTimezone] = useState(initialTimezone);
  const [newName, setNewName] = useState('');

  const save = useMutation({
    mutationFn: () => api('/workspaces/current', { method: 'PATCH', body: { name, timezone } }),
    onSuccess: () => (
      qc.invalidateQueries({ queryKey: ['workspace'] }),
      qc.invalidateQueries({ queryKey: ['me'] }),
      toast.success('Saved')
    ),
  });
  const create = useMutation({
    mutationFn: () =>
      api<{ id: string }>('/workspaces', { method: 'POST', body: { name: newName } }),
    onSuccess: async (w) => {
      await qc.invalidateQueries({ queryKey: ['me'] });
      switchWorkspace(w.id);
    },
  });

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Workspace</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={(e) => (e.preventDefault(), save.mutate())}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="ws-name">Name</FieldLabel>
                <Input
                  id="ws-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={!can('ADMIN')}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="tz">Timezone</FieldLabel>
                <Input
                  id="tz"
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  disabled={!can('ADMIN')}
                  placeholder="America/New_York"
                />
                <FieldDescription>
                  Your browser says {Intl.DateTimeFormat().resolvedOptions().timeZone}.
                </FieldDescription>
              </Field>
              <Button type="submit" className="w-fit" disabled={!can('ADMIN') || save.isPending}>
                Save
              </Button>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>New workspace</CardTitle>
          <CardDescription>
            Separate billing, channels and team — great for agencies or a second business.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="flex gap-2"
            onSubmit={(e) => (e.preventDefault(), newName.trim() && create.mutate())}
          >
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Workspace name"
            />
            <Button type="submit" disabled={create.isPending}>
              Create
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
