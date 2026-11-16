'use client';

import { useMutation } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api/client';

export function ResetForm() {
  const token = useSearchParams().get('token') ?? '';
  const router = useRouter();
  const [password, setPassword] = useState('');
  const reset = useMutation({
    mutationFn: () => api('/auth/reset-password', { method: 'POST', body: { token, password } }),
    onSuccess: () => {
      toast.success('Password updated — sign in with your new password');
      router.replace('/login');
    },
  });
  return (
    <form onSubmit={(e) => (e.preventDefault(), reset.mutate())} className="space-y-6">
      <h1 className="text-2xl font-semibold">Choose a new password</h1>
      <Field>
        <FieldLabel htmlFor="password">New password</FieldLabel>
        <Input
          id="password"
          type="password"
          minLength={10}
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <FieldDescription>At least 10 characters with a letter and a number.</FieldDescription>
      </Field>
      <Button type="submit" className="w-full" disabled={reset.isPending || !token}>
        Update password
      </Button>
    </form>
  );
}
