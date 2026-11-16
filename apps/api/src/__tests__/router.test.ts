import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { signAccessToken } from '../core/auth/jwt.js';
import { errorHandler } from '../core/http/middleware/error.js';
import { created } from '../core/http/responses.js';
import { defineRoutes } from '../core/http/router.js';

const mod = defineRoutes('/things', (r) => {
  r.get(
    '/public',
    { auth: 'public', query: z.object({ n: z.coerce.number().default(1) }) },
    ({ query }) => ({ doubled: query.n * 2 }),
  );
  r.post('/me', { auth: 'user', body: z.object({ title: z.string().min(3) }) }, ({ user, body }) =>
    created({ by: user.email, title: body.title }),
  );
});

const app = express().use(cookieParser()).use(mod.basePath, mod.router).use(errorHandler);

describe('route builder', () => {
  it('validates and coerces query params', async () => {
    const res = await request(app).get('/things/public?n=21');
    expect(res.body).toEqual({ doubled: 42 });
  });

  it('rejects unauthenticated requests on protected routes', async () => {
    const res = await request(app).post('/things/me').send({ title: 'hello' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('returns structured validation errors', async () => {
    const token = signAccessToken({ sub: 'u1', email: 'a@b.co', name: 'A' });
    const res = await request(app)
      .post('/things/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'x' });
    expect(res.status).toBe(422);
    expect(res.body.error.details[0].path).toBe('body.title');
  });

  it('runs the handler for valid authenticated requests', async () => {
    const token = signAccessToken({ sub: 'u1', email: 'a@b.co', name: 'A' });
    const res = await request(app)
      .post('/things/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Launch day' });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ by: 'a@b.co', title: 'Launch day' });
  });
});
