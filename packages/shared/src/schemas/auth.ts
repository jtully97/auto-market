import { z } from 'zod';

const password = z
  .string()
  .min(10, 'Use at least 10 characters')
  .max(128)
  .regex(/[a-zA-Z]/, 'Include a letter')
  .regex(/[0-9]/, 'Include a number');

export const registerSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.email().toLowerCase(),
  password,
  workspaceName: z.string().trim().min(1).max(100).optional(),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.email().toLowerCase(),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const forgotPasswordSchema = z.object({ email: z.email().toLowerCase() });
export const resetPasswordSchema = z.object({ token: z.string().min(20), password });
