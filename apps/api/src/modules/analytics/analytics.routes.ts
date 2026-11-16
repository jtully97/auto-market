import { idParamsSchema, PLATFORMS } from '@automarket/shared';
import { z } from 'zod';
import { defineRoutes } from '../../core/http/router.js';
import { analyticsService } from './analytics.service.js';

export default defineRoutes('/analytics', (r) => {
  r.get(
    '/overview',
    {
      query: z.object({
        brandId: z.string().optional(),
        platform: z.enum(PLATFORMS).optional(),
        days: z.coerce.number().int().min(7).max(365).default(30),
      }),
    },
    ({ workspace, query }) => analyticsService.overview(workspace, query),
  );
  r.get('/posts/:id', { params: idParamsSchema }, ({ workspace, params }) =>
    analyticsService.postMetrics(workspace, params.id),
  );
});
