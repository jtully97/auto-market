'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import { api, getActiveWorkspace, setActiveWorkspace } from '@/lib/api/client';
import type { Me, Role } from '@/lib/api/types';

interface Session {
  me: Me;
  workspaceId: string;
  role: Role;
  can: (minimum: Role) => boolean;
  switchWorkspace: (id: string) => void;
  signOut: () => Promise<void>;
}

const RANK: Record<Role, number> = { VIEWER: 0, EDITOR: 1, ADMIN: 2, OWNER: 3 };
const SessionContext = createContext<Session | null>(null);

export const useSession = () => {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside <SessionProvider>');
  return ctx;
};

/** Loads the signed-in user and pins the active workspace before rendering the app. */
export function SessionProvider({
  children,
  fallback,
}: {
  children: ReactNode;
  fallback: ReactNode;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const { data: me } = useQuery({
    queryKey: ['me'],
    queryFn: () => api<Me>('/auth/me'),
    staleTime: 5 * 60_000,
  });

  const stored = getActiveWorkspace();
  const active = me?.workspaces.find((w) => w.id === stored) ?? me?.workspaces[0];
  // Pin synchronously so every request made by children carries the right workspace header.
  if (active && active.id !== stored) setActiveWorkspace(active.id);

  const switchWorkspace = useCallback(
    (id: string) => {
      setActiveWorkspace(id);
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' });
      router.push('/dashboard');
    },
    [qc, router],
  );

  const signOut = useCallback(async () => {
    await api('/auth/logout', { method: 'POST' });
    setActiveWorkspace(null);
    qc.clear();
    router.replace('/login');
  }, [qc, router]);

  const value = useMemo<Session | null>(() => {
    if (!me || !active) return null;
    return {
      me,
      workspaceId: active.id,
      role: active.role,
      can: (minimum) => RANK[active.role] >= RANK[minimum],
      switchWorkspace,
      signOut,
    };
  }, [me, active, switchWorkspace, signOut]);

  if (!value) return <>{fallback}</>;
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
