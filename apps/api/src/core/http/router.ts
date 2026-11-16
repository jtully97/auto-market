import express, { Router, type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import { ValidationError } from '../errors.js';
import { authenticate } from './middleware/auth.js';
import { HttpResponse } from './responses.js';
import type { Handler, RouteConfig } from './types.js';

type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';

const parse = (schema: RouteConfig['body'], value: unknown, location: string) => {
  if (!schema) return value ?? {};
  const result = schema.safeParse(value ?? {});
  if (!result.success) {
    throw new ValidationError(
      result.error.issues.map((i) => ({
        path: [location, ...i.path].join('.'),
        message: i.message,
      })),
    );
  }
  return result.data;
};

/**
 * Declarative route builder. Each route declares auth, role, validation and
 * upload needs; the builder wires middleware, validation, error propagation and
 * response serialization so controllers contain only intent.
 *
 *   export default defineRoutes('/posts', (r) => {
 *     r.get('/', { query: listPostsQuerySchema }, posts.list);
 *     r.post('/', { role: 'EDITOR', body: upsertPostSchema }, posts.create);
 *   });
 */
export class RouteBuilder {
  readonly router = Router();

  private add<const C extends RouteConfig>(
    method: Method,
    path: string,
    config: C,
    handler: Handler<C>,
  ) {
    const middleware: express.RequestHandler[] = [];
    if (config.rawBody) middleware.push(express.raw({ type: '*/*', limit: '2mb' }));
    else middleware.push(express.json({ limit: '2mb' }));
    middleware.push(authenticate(config.auth ?? 'workspace', config.role));
    if (config.upload) {
      middleware.push(
        multer({
          storage: multer.memoryStorage(),
          limits: { fileSize: config.upload.maxBytes },
        }).single(config.upload.field),
      );
    }

    this.router[method](
      path,
      ...middleware,
      async (req: Request, res: Response, _next: NextFunction) => {
        const ctx = {
          body: config.rawBody ? req.body : parse(config.body, req.body, 'body'),
          query: parse(config.query, req.query, 'query'),
          params: parse(config.params, req.params, 'params'),
          file: req.file,
          user: req.user,
          workspace: req.workspace,
          req,
          res,
        } as unknown as Parameters<Handler<C>>[0];

        const result = await handler(ctx);
        if (res.headersSent) return;
        if (result instanceof HttpResponse) {
          if (result.redirectTo) return res.redirect(result.status, result.redirectTo);
          if (result.body === undefined) return res.status(result.status).end();
          return res.status(result.status).json(result.body);
        }
        if (result === undefined) return res.status(204).end();
        return res.json(result);
      },
    );
  }

  get<const C extends RouteConfig>(path: string, config: C, handler: Handler<C>) {
    this.add('get', path, config, handler);
  }
  post<const C extends RouteConfig>(path: string, config: C, handler: Handler<C>) {
    this.add('post', path, config, handler);
  }
  put<const C extends RouteConfig>(path: string, config: C, handler: Handler<C>) {
    this.add('put', path, config, handler);
  }
  patch<const C extends RouteConfig>(path: string, config: C, handler: Handler<C>) {
    this.add('patch', path, config, handler);
  }
  delete<const C extends RouteConfig>(path: string, config: C, handler: Handler<C>) {
    this.add('delete', path, config, handler);
  }
}

export interface RouteModule {
  basePath: string;
  router: Router;
}

export const defineRoutes = (basePath: string, build: (r: RouteBuilder) => void): RouteModule => {
  const builder = new RouteBuilder();
  build(builder);
  return { basePath, router: builder.router };
};
