import { checkoutSchema, creditPackCheckoutSchema, CREDIT_PACKS, PLANS } from '@automarket/shared';
import { defineRoutes } from '../../core/http/router.js';
import { billingService as svc } from './billing.service.js';

export default defineRoutes('/billing', (r) => {
  r.get('/plans', { auth: 'public' }, () => ({ plans: Object.values(PLANS), packs: CREDIT_PACKS }));
  r.post('/checkout', { role: 'OWNER', body: checkoutSchema }, ({ workspace, user, body }) =>
    svc.checkout(workspace, user, body.planId, body.interval),
  );
  r.post(
    '/credits/checkout',
    { role: 'ADMIN', body: creditPackCheckoutSchema },
    ({ workspace, user, body }) => svc.creditPackCheckout(workspace, user, body.packId),
  );
  r.post('/portal', { role: 'OWNER' }, ({ workspace, user }) => svc.portal(workspace, user));
  r.get('/invoices', { role: 'ADMIN' }, ({ workspace }) => svc.invoices(workspace));
  r.post('/webhook', { auth: 'public', rawBody: true }, ({ req }) =>
    svc.handleWebhook(req.body as Buffer, req.header('stripe-signature')),
  );
});
