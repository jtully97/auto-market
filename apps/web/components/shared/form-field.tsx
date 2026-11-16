'use client';

import type { ReactNode } from 'react';
import { Controller, type Control, type FieldPath, type FieldValues } from 'react-hook-form';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';

/**
 * react-hook-form + shadcn Field in one component, so every form renders
 * labels, help text and validation errors the same way.
 */
export function FormField<T extends FieldValues>({
  control,
  name,
  label,
  description,
  children,
}: {
  control: Control<T>;
  name: FieldPath<T>;
  label?: string;
  description?: ReactNode;
  children: (field: {
    value: unknown;
    onChange: (v: unknown) => void;
    onBlur: () => void;
    name: string;
    id: string;
    'aria-invalid': boolean;
  }) => ReactNode;
}) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid || undefined}>
          {label && <FieldLabel htmlFor={name}>{label}</FieldLabel>}
          {children({ ...field, id: name, 'aria-invalid': fieldState.invalid })}
          {description && !fieldState.error && <FieldDescription>{description}</FieldDescription>}
          {fieldState.error && <FieldError errors={[fieldState.error]} />}
        </Field>
      )}
    />
  );
}
