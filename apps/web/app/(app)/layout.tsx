import { AppShell } from '@/components/app/app-shell';

/**
 * The signed-in app is rendered client-side behind the session gate, so there is
 * no server-rendered segment for Next to validate for instant navigation.
 */
export const instant = false;

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
