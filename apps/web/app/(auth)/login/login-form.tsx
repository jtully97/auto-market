'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema, type LoginInput } from '@automarket/shared';
import { useMutation } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { FormField } from '@/components/shared/form-field';
import { Button } from '@/components/ui/button';
import { FieldGroup } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api/client';

export function LoginForm() {
  const router = useRouter();
  const next = useSearchParams().get('next') ?? '/dashboard';
  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });
  const login = useMutation({
    mutationFn: (body: LoginInput) => api('/auth/login', { method: 'POST', body }),
    onSuccess: () => router.replace(next.startsWith('/') ? next : '/dashboard'),
  });

  return (
    <form onSubmit={form.handleSubmit((v) => login.mutate(v))} className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Welcome back</h1>
        <p className="text-muted-foreground text-sm">Sign in to keep your marketing running.</p>
      </div>
      <FieldGroup>
        <FormField control={form.control} name="email" label="Email">
          {(f) => <Input {...f} value={f.value as string} type="email" autoComplete="email" />}
        </FormField>
        <FormField control={form.control} name="password" label="Password">
          {(f) => (
            <Input
              {...f}
              value={f.value as string}
              type="password"
              autoComplete="current-password"
            />
          )}
        </FormField>
      </FieldGroup>
      <Button type="submit" className="w-full" size="lg" disabled={login.isPending}>
        {login.isPending ? 'Signing in…' : 'Sign in'}
      </Button>
      <div className="text-muted-foreground flex justify-between text-sm">
        <Link
          href="/forgot-password"
          className="hover:text-foreground underline-offset-4 hover:underline"
        >
          Forgot password?
        </Link>
        <Link href="/register" className="hover:text-foreground underline-offset-4 hover:underline">
          Create an account
        </Link>
      </div>
    </form>
  );
}
