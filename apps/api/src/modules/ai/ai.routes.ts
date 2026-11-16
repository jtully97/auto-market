import {
  analystRequestSchema,
  generateImageSchema,
  generateTextSchema,
  generateVideoSchema,
  idParamsSchema,
} from '@automarket/shared';
import { z } from 'zod';
import { accepted, created } from '../../core/http/responses.js';
import { defineRoutes } from '../../core/http/router.js';
import { aiService } from './ai.service.js';
import { analystService } from './analyst.service.js';

export default defineRoutes('/ai', (r) => {
  r.get(
    '/generations',
    {
      query: z.object({
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(1).max(100).default(30),
        type: z.enum(['TEXT', 'IMAGE', 'VIDEO', 'ANALYST']).optional(),
        brandId: z.string().optional(),
      }),
    },
    ({ workspace, query }) => aiService.list(workspace, query),
  );
  r.get('/generations/:id', { params: idParamsSchema }, ({ workspace, params }) =>
    aiService.get(workspace, params.id),
  );
  r.post(
    '/generations/:id/cancel',
    { role: 'EDITOR', params: idParamsSchema },
    ({ workspace, params }) => aiService.cancel(workspace, params.id),
  );
  r.post(
    '/generations/:id/drafts',
    { role: 'EDITOR', params: idParamsSchema },
    ({ workspace, user, params }) => aiService.planToDrafts(workspace, user, params.id),
  );

  r.post('/text', { role: 'EDITOR', body: generateTextSchema }, async ({ workspace, user, body }) =>
    created(await aiService.generateText(workspace, user, body)),
  );
  r.post(
    '/image',
    { role: 'EDITOR', body: generateImageSchema },
    async ({ workspace, user, body }) => {
      const g = await aiService.generateImage(workspace, user, body);
      return g.status === 'RUNNING' ? accepted(g) : created(g);
    },
  );
  r.post(
    '/video',
    { role: 'EDITOR', body: generateVideoSchema },
    async ({ workspace, user, body }) =>
      accepted(await aiService.generateVideo(workspace, user, body)),
  );
  r.post(
    '/analyst',
    { role: 'EDITOR', body: analystRequestSchema },
    async ({ workspace, user, body }) =>
      created(
        body.kind === 'nicheReport'
          ? await analystService.nicheReport(workspace, user, body.brandId, body.question)
          : await analystService.performanceInsights(workspace, user, body.brandId, body.question),
      ),
  );
});
