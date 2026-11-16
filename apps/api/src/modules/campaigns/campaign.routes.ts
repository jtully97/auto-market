import {
  emailCampaignSchema,
  idParamsSchema,
  paginationQuerySchema,
  sendTestEmailSchema,
} from '@automarket/shared';
import { z } from 'zod';
import { created, noContent } from '../../core/http/responses.js';
import { defineRoutes } from '../../core/http/router.js';
import { campaignService as svc } from './campaign.service.js';

export default defineRoutes('/campaigns', (r) => {
  r.get('/', { query: paginationQuerySchema }, ({ workspace, query }) =>
    svc.list(workspace, query),
  );
  r.post(
    '/recipients',
    { body: z.object({ listIds: z.array(z.string()) }) },
    ({ workspace, body }) => svc.recipientCount(workspace, body.listIds),
  );
  r.get('/:id', { params: idParamsSchema }, ({ workspace, params }) =>
    svc.get(workspace, params.id),
  );
  r.post('/', { role: 'EDITOR', body: emailCampaignSchema }, async ({ workspace, body }) =>
    created(await svc.create(workspace, body)),
  );
  r.put(
    '/:id',
    { role: 'EDITOR', params: idParamsSchema, body: emailCampaignSchema },
    ({ workspace, params, body }) => svc.update(workspace, params.id, body),
  );
  r.delete('/:id', { role: 'EDITOR', params: idParamsSchema }, async ({ workspace, params }) => {
    await svc.remove(workspace, params.id);
    return noContent();
  });
  r.post(
    '/:id/test',
    { role: 'EDITOR', params: idParamsSchema, body: sendTestEmailSchema },
    ({ workspace, params, body }) => svc.sendTest(workspace, params.id, body.to),
  );
  r.post(
    '/:id/schedule',
    {
      role: 'EDITOR',
      params: idParamsSchema,
      body: z.object({ scheduledAt: z.coerce.date().nullable().optional() }),
    },
    ({ workspace, params, body }) => svc.schedule(workspace, params.id, body.scheduledAt ?? null),
  );
  r.post('/:id/cancel', { role: 'EDITOR', params: idParamsSchema }, ({ workspace, params }) =>
    svc.cancel(workspace, params.id),
  );
});
