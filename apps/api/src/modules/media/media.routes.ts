import { idParamsSchema } from '@automarket/shared';
import { z } from 'zod';
import { created, noContent } from '../../core/http/responses.js';
import { defineRoutes } from '../../core/http/router.js';
import { MAX_UPLOAD_BYTES, mediaService as svc } from './media.service.js';

export default defineRoutes('/media', (r) => {
  r.get(
    '/',
    {
      query: z.object({
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(1).max(100).default(40),
        kind: z.enum(['IMAGE', 'VIDEO']).optional(),
        brandId: z.string().optional(),
      }),
    },
    ({ workspace, query }) => svc.list(workspace, query),
  );
  r.post(
    '/',
    {
      role: 'EDITOR',
      upload: { field: 'file', maxBytes: MAX_UPLOAD_BYTES },
      query: z.object({ brandId: z.string().optional() }),
    },
    async ({ workspace, file, query }) => created(await svc.upload(workspace, file, query.brandId)),
  );
  r.post(
    '/uploads',
    { role: 'EDITOR', body: z.object({ mimeType: z.string(), size: z.number().int().positive() }) },
    ({ workspace, body }) => svc.createUpload(workspace, body.mimeType, body.size),
  );
  r.post(
    '/uploads/complete',
    {
      role: 'EDITOR',
      body: z.object({
        key: z.string(),
        mimeType: z.string(),
        size: z.number().int().positive(),
        brandId: z.string().optional(),
        width: z.number().int().optional(),
        height: z.number().int().optional(),
        durationSec: z.number().optional(),
      }),
    },
    async ({ workspace, body }) => created(await svc.completeUpload(workspace, body)),
  );
  r.delete('/:id', { role: 'EDITOR', params: idParamsSchema }, async ({ workspace, params }) => {
    await svc.remove(workspace, params.id);
    return noContent();
  });
});
