import { brandProfileSchema, idParamsSchema, paginationQuerySchema } from '@automarket/shared';
import { defineRoutes } from '../../core/http/router.js';
import { brandController as c } from './brand.controller.js';

export default defineRoutes('/brands', (r) => {
  r.get('/', { query: paginationQuerySchema }, c.list);
  r.get('/:id', { params: idParamsSchema }, c.get);
  r.post('/', { role: 'ADMIN', body: brandProfileSchema }, c.create);
  r.patch(
    '/:id',
    { role: 'EDITOR', params: idParamsSchema, body: brandProfileSchema.partial() },
    c.update,
  );
  r.delete('/:id', { role: 'ADMIN', params: idParamsSchema }, c.remove);
});
