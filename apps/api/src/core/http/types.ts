import type { Request, Response } from 'express';
import type { PlanDefinition } from '@automarket/shared';
import type { z } from 'zod';
import type { WorkspaceRole } from '../db/prisma.js';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

export interface WorkspaceContext {
  id: string;
  name: string;
  role: WorkspaceRole;
  planId: string;
  plan: PlanDefinition;
  timezone: string;
}

export type AuthMode = 'public' | 'user' | 'workspace';

export interface RouteConfig {
  /** Defaults to 'workspace' — secure by default. */
  auth?: AuthMode;
  /** Minimum role required in the active workspace. */
  role?: WorkspaceRole;
  body?: z.ZodType;
  query?: z.ZodType;
  params?: z.ZodType;
  /** Skip JSON body parsing (e.g. Stripe webhooks need the raw body). */
  rawBody?: boolean;
  /** Multer single-file upload field name. */
  upload?: { field: string; maxBytes: number };
}

type Infer<S> = S extends z.ZodType ? z.output<S> : Record<string, never>;

type AuthCtx<A> = A extends 'public'
  ? { user: AuthUser | undefined; workspace: undefined }
  : A extends 'user'
    ? { user: AuthUser; workspace: WorkspaceContext | undefined }
    : { user: AuthUser; workspace: WorkspaceContext };

export type HandlerContext<C extends RouteConfig> = {
  body: Infer<C['body']>;
  query: Infer<C['query']>;
  params: Infer<C['params']>;
  file: Express.Multer.File | undefined;
  req: Request;
  res: Response;
} & AuthCtx<C['auth'] extends AuthMode ? C['auth'] : 'workspace'>;

export type Handler<C extends RouteConfig> = (ctx: HandlerContext<C>) => unknown | Promise<unknown>;

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
      workspace?: WorkspaceContext;
    }
  }
}
