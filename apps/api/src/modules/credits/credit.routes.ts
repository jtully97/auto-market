import { paginationQuerySchema } from '@automarket/shared';
import { defineRoutes } from '../../core/http/router.js';
import { creditController } from './credit.controller.js';

export default defineRoutes('/credits', (r) => {
  r.get('/balance', {}, creditController.balance);
  r.get('/history', { query: paginationQuerySchema }, creditController.history);
  r.get('/pricing', { auth: 'public' }, creditController.pricing);
});
