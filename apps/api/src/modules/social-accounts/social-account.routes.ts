import { idParamsSchema, PLATFORMS, type Platform } from '@automarket/shared';
import { z } from 'zod';
import { noContent, redirect } from '../../core/http/responses.js';
import { defineRoutes } from '../../core/http/router.js';
import { socialAccountService as svc } from './social-account.service.js';

const platformParam = z.object({
  platform: z
    .string()
    .transform((p) => p.toUpperCase())
    .pipe(z.enum(PLATFORMS)),
});

export default defineRoutes('/social-accounts', (r) => {
  r.get('/platforms', { auth: 'public' }, () => svc.platforms());
  r.get('/', { query: z.object({ brandId: z.string().optional() }) }, ({ workspace, query }) =>
    svc.list(workspace, query.brandId),
  );
  r.post(
    '/connect/:platform',
    { role: 'ADMIN', params: platformParam, body: z.object({ brandId: z.string().optional() }) },
    ({ workspace, user, params, body }) =>
      svc.startConnect(workspace, user, params.platform as Platform, body.brandId),
  );
  r.get(
    '/callback/:platform',
    {
      auth: 'public',
      params: platformParam,
      query: z.object({
        code: z.string().optional(),
        state: z.string().optional(),
        error: z.string().optional(),
      }),
    },
    async ({ params, query }) =>
      redirect(await svc.completeConnect(params.platform as Platform, query)),
  );
  r.patch(
    '/:id',
    { role: 'ADMIN', params: idParamsSchema, body: z.object({ brandId: z.string().nullable() }) },
    ({ workspace, params, body }) => svc.update(workspace, params.id, body),
  );
  r.delete('/:id', { role: 'ADMIN', params: idParamsSchema }, async ({ workspace, params }) => {
    await svc.disconnect(workspace, params.id);
    return noContent();
  });
});
