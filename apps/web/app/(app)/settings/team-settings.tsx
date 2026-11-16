'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash2, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { useSession } from '@/components/providers/session';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { api } from '@/lib/api/client';
import { useMembers } from '@/lib/api/resources';

const ROLE_HELP: Record<string, string> = {
  ADMIN: 'Everything except billing',
  EDITOR: 'Create and schedule content',
  VIEWER: 'Read-only',
};

export function TeamSettings() {
  const { can, me } = useSession();
  const qc = useQueryClient();
  const { data } = useMembers();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('EDITOR');
  const refresh = () => qc.invalidateQueries({ queryKey: ['members'] });
  const invite = useMutation({
    mutationFn: () =>
      api('/workspaces/current/invitations', { method: 'POST', body: { email, role } }),
    onSuccess: () => (toast.success(`Invitation sent to ${email}`), setEmail(''), refresh()),
  });
  const changeRole = useMutation({
    mutationFn: ({ id, role }: { id: string; role: string }) =>
      api(`/workspaces/current/members/${id}`, { method: 'PATCH', body: { role } }),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/workspaces/current/members/${id}`, { method: 'DELETE' }),
    onSuccess: refresh,
  });

  return (
    <div className="space-y-6">
      {can('ADMIN') && (
        <Card>
          <CardHeader>
            <CardTitle>Invite a teammate</CardTitle>
            <CardDescription>They&apos;ll get an email with a link to join.</CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="flex flex-wrap gap-2"
              onSubmit={(e) => (e.preventDefault(), invite.mutate())}
            >
              <Input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="teammate@company.com"
                className="max-w-xs"
              />
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(ROLE_HELP).map(([r, help]) => (
                    <SelectItem key={r} value={r}>
                      {r.toLowerCase()} — {help}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button type="submit" disabled={invite.isPending}>
                <UserPlus className="size-4" /> Invite
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
        </CardHeader>
        <CardContent className="divide-y">
          {data?.members.map((m) => (
            <div key={m.id} className="flex items-center gap-3 py-3">
              <div className="flex-1">
                <div className="font-medium">
                  {m.user.name}{' '}
                  {m.user.id === me.id && (
                    <span className="text-muted-foreground text-xs">(you)</span>
                  )}
                </div>
                <div className="text-muted-foreground text-sm">{m.user.email}</div>
              </div>
              {m.role === 'OWNER' || !can('ADMIN') ? (
                <Badge variant="secondary" className="capitalize">
                  {m.role.toLowerCase()}
                </Badge>
              ) : (
                <>
                  <Select
                    value={m.role}
                    onValueChange={(r) => changeRole.mutate({ id: m.id, role: r })}
                  >
                    <SelectTrigger className="w-28">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.keys(ROLE_HELP).map((r) => (
                        <SelectItem key={r} value={r}>
                          {r.toLowerCase()}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Remove member"
                    onClick={() => remove.mutate(m.id)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </>
              )}
            </div>
          ))}
          {data?.invitations.map((i) => (
            <div key={i.id} className="flex items-center gap-3 py-3">
              <div className="text-muted-foreground flex-1 text-sm">{i.email}</div>
              <Badge variant="outline">Invited · {i.role.toLowerCase()}</Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
