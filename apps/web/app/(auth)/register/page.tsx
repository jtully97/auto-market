'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { registerSchema, type RegisterInput } from '@automarket/shared';
import { useMutation } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { FormField } from '@/components/shared/form-field';
import { Button } from '@/components/ui/button';
import { FieldGroup } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { api, setActiveWorkspace } from '@/lib/api/client';

export default function RegisterPage() {
  const router = useRouter();
  const form = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: '', email: '', password: '', workspaceName: '' },
  });
  const register = useMutation({
    mutationFn: (body: RegisterInput) =>
      api<{ workspaceId: string }>('/auth/register', {
        method: 'POST',
        body: { ...body, workspaceName: body.workspaceName || undefined },
      }),
    onSuccess: ({ workspaceId }) => {
      setActiveWorkspace(workspaceId);
      router.replace('/dashboard?welcome=1');
    },
  });

  return (
    <form onSubmit={form.handleSubmit((v) => register.mutate(v))} className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Start free</h1>
        <p className="text-muted-foreground text-sm">
          No card needed. 100 AI credits every month on the free plan.
        </p>
      </div>
      <FieldGroup>
        <FormField control={form.control} name="name" label="Your name">
          {(f) => <Input {...f} value={f.value as string} autoComplete="name" />}
        </FormField>
        <FormField
          control={form.control}
          name="workspaceName"
          label="Business name"
          description="You can change this later."
        >
          {(f) => <Input {...f} value={(f.value as string) ?? ''} placeholder="Acme Coffee" />}
        </FormField>
        <FormField control={form.control} name="email" label="Work email">
          {(f) => <Input {...f} value={f.value as string} type="email" autoComplete="email" />}
        </FormField>
        <FormField
          control={form.control}
          name="password"
          label="Password"
          description="At least 10 characters with a letter and a number."
        >
          {(f) => (
            <Input {...f} value={f.value as string} type="password" autoComplete="new-password" />
          )}
        </FormField>
      </FieldGroup>
      <Button type="submit" className="w-full" size="lg" disabled={register.isPending}>
        {register.isPending ? 'Creating your workspace…' : 'Create account'}
      </Button>
      <p className="text-muted-foreground text-center text-sm">
        Already have an account?{' '}
        <Link href="/login" className="text-foreground underline-offset-4 hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}
