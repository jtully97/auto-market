import {
  idParamsSchema,
  listPostsQuerySchema,
  postingScheduleSchema,
  upsertPostSchema,
  validateForPlatform,
  PLATFORMS,
} from '@automarket/shared';
import { z } from 'zod';
import { created, noContent } from '../../core/http/responses.js';
import { defineRoutes } from '../../core/http/router.js';
import { postService as svc } from './post.service.js';

export default defineRoutes('/posts', (r) => {
  r.get('/', { query: listPostsQuerySchema }, ({ workspace, query }) => svc.list(workspace, query));
  r.get(
    '/schedules',
    { query: z.object({ brandId: z.string().optional() }) },
    ({ workspace, query }) => svc.listSchedules(workspace, query.brandId),
  );
  r.post(
    '/schedules',
    { role: 'EDITOR', body: postingScheduleSchema },
    async ({ workspace, body }) => created(await svc.createSchedule(workspace, body)),
  );
  r.delete(
    '/schedules/:id',
    { role: 'EDITOR', params: idParamsSchema },
    async ({ workspace, params }) => {
      await svc.deleteSchedule(workspace, params.id);
      return noContent();
    },
  );
  r.get(
    '/next-slot',
    { query: z.object({ brandId: z.string() }) },
    async ({ workspace, query }) => ({
      slot: await svc.nextFreeSlot(workspace.id, query.brandId),
    }),
  );
  /** Dry-run validation for the composer. */
  r.post(
    '/validate',
    {
      body: z.object({
        caption: z.string(),
        platforms: z.array(z.enum(PLATFORMS)),
        media: z.array(z.object({ kind: z.enum(['IMAGE', 'VIDEO']) })),
      }),
    },
    ({ body }) => ({
      issues: body.platforms.flatMap((p) => validateForPlatform(p, body.caption, body.media)),
    }),
  );
  r.get('/:id', { params: idParamsSchema }, ({ workspace, params }) =>
    svc.get(workspace, params.id),
  );
  r.post('/', { role: 'EDITOR', body: upsertPostSchema }, async ({ workspace, user, body }) =>
    created(await svc.create(workspace, user, body)),
  );
  r.put(
    '/:id',
    { role: 'EDITOR', params: idParamsSchema, body: upsertPostSchema },
    ({ workspace, params, body }) => svc.update(workspace, params.id, body),
  );
  r.patch(
    '/:id/schedule',
    { role: 'EDITOR', params: idParamsSchema, body: z.object({ scheduledAt: z.coerce.date() }) },
    ({ workspace, params, body }) => svc.reschedule(workspace, params.id, body.scheduledAt),
  );
  r.post('/:id/approve', { role: 'ADMIN', params: idParamsSchema }, ({ workspace, user, params }) =>
    svc.approve(workspace, user, params.id),
  );
  r.post('/:id/retry', { role: 'EDITOR', params: idParamsSchema }, ({ workspace, params }) =>
    svc.retry(workspace, params.id),
  );
  r.post(
    '/:id/duplicate',
    { role: 'EDITOR', params: idParamsSchema },
    async ({ workspace, user, params }) => created(await svc.duplicate(workspace, user, params.id)),
  );
  r.delete('/:id', { role: 'EDITOR', params: idParamsSchema }, async ({ workspace, params }) => {
    await svc.remove(workspace, params.id);
    return noContent();
  });
});
