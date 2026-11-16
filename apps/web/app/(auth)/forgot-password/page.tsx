'use client';

import { useMutation } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api/client';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const send = useMutation({
    mutationFn: () => api('/auth/forgot-password', { method: 'POST', body: { email } }),
  });
  if (send.isSuccess) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Check your inbox</h1>
        <p className="text-muted-foreground text-sm">
          If an account exists for {email}, a reset link is on its way.
        </p>
        <Link href="/login" className="text-sm underline">
          Back to sign in
        </Link>
      </div>
    );
  }
  return (
    <form onSubmit={(e) => (e.preventDefault(), send.mutate())} className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Reset your password</h1>
        <p className="text-muted-foreground text-sm">
          We&apos;ll email you a link to choose a new one.
        </p>
      </div>
      <Field>
        <FieldLabel htmlFor="email">Email</FieldLabel>
        <Input
          id="email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </Field>
      <Button type="submit" className="w-full" disabled={send.isPending}>
        Send reset link
      </Button>
    </form>
  );
}
