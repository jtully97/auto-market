import {
  contactImportSchema,
  contactSchema,
  idParamsSchema,
  paginationQuerySchema,
} from '@automarket/shared';
import { z } from 'zod';
import { ValidationError } from '../../core/errors.js';
import { created } from '../../core/http/responses.js';
import { defineRoutes } from '../../core/http/router.js';
import { contactListBody, contactListController as lists } from './contact-list.module.js';
import { contactService as svc, MAX_IMPORT_BYTES } from './contact.service.js';

const ids = z.object({ ids: z.array(z.string()).min(1).max(5000) });

export const contactListRoutes = defineRoutes('/contact-lists', (r) => {
  r.get('/', { query: paginationQuerySchema }, lists.list);
  r.get('/:id', { params: idParamsSchema }, lists.get);
  r.post('/', { role: 'EDITOR', body: contactListBody }, lists.create);
  r.patch(
    '/:id',
    { role: 'EDITOR', params: idParamsSchema, body: contactListBody.partial() },
    lists.update,
  );
  r.delete('/:id', { role: 'EDITOR', params: idParamsSchema }, lists.remove);
  r.post(
    '/:id/members',
    { role: 'EDITOR', params: idParamsSchema, body: ids },
    ({ workspace, params, body }) => svc.addToList(workspace, params.id, body.ids),
  );
  r.delete(
    '/:id/members',
    { role: 'EDITOR', params: idParamsSchema, body: ids },
    ({ workspace, params, body }) => svc.removeFromList(workspace, params.id, body.ids),
  );
});

export default defineRoutes('/contacts', (r) => {
  r.get(
    '/',
    {
      query: z.object({
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(1).max(200).default(50),
        search: z.string().optional(),
        status: z.enum(['SUBSCRIBED', 'UNSUBSCRIBED', 'BOUNCED', 'COMPLAINED']).optional(),
        listId: z.string().optional(),
        tag: z.string().optional(),
      }),
    },
    ({ workspace, query }) => svc.list(workspace, query),
  );
  r.post('/', { role: 'EDITOR', body: contactSchema }, async ({ workspace, body }) =>
    created(await svc.create(workspace, body)),
  );
  r.patch(
    '/:id',
    {
      role: 'EDITOR',
      params: idParamsSchema,
      body: contactSchema
        .partial()
        .extend({ status: z.enum(['SUBSCRIBED', 'UNSUBSCRIBED']).optional() }),
    },
    ({ workspace, params, body }) => svc.update(workspace, params.id, body),
  );
  r.post('/bulk-delete', { role: 'EDITOR', body: ids }, ({ workspace, body }) =>
    svc.bulkDelete(workspace, body.ids),
  );
  r.post(
    '/import/preview',
    { role: 'EDITOR', upload: { field: 'file', maxBytes: MAX_IMPORT_BYTES } },
    ({ file }) => svc.previewCsv(file),
  );
  /** multipart: file + `options` JSON field ({ mapping, listId, tags, consentConfirmed }). */
  r.post(
    '/import',
    { role: 'EDITOR', upload: { field: 'file', maxBytes: MAX_IMPORT_BYTES } },
    async ({ workspace, file, req }) => {
      const parsed = contactImportSchema.safeParse(JSON.parse(String(req.body?.options ?? '{}')));
      if (!parsed.success)
        throw new ValidationError(parsed.error.issues, parsed.error.issues[0]?.message);
      return created(await svc.startImport(workspace, file, parsed.data));
    },
  );
  r.get('/import/:id', { params: idParamsSchema }, ({ workspace, params }) =>
    svc.getImport(workspace, params.id),
  );
});
