import { z } from 'zod';
import { verifyLinkToken } from '../../core/auth/jwt.js';
import { logger } from '../../core/logger.js';
import { defineRoutes } from '../../core/http/router.js';
import { higgsfieldClient } from '../../integrations/higgsfield/higgsfield.client.js';
import { aiService } from '../ai/ai.service.js';
import { campaignService } from '../campaigns/campaign.service.js';

/** Inbound provider webhooks (signature-verified). Stripe lives under /billing/webhook. */
export default defineRoutes('/webhooks', (r) => {
  r.post('/higgsfield', { auth: 'public', rawBody: true }, async ({ req }) => {
    const headers = Object.fromEntries(Object.entries(req.headers).map(([k, v]) => [k, String(v)]));
    const event = higgsfieldClient.verifyWebhook((req.body as Buffer).toString('utf8'), headers);
    await aiService.completeHiggsfield(event.request_id, {
      status: event.status,
      error: event.error,
      ...(event.payload ?? {}),
    });
    return { ok: true };
  });
});

const PIXEL = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
const tokenParam = z.object({ token: z.string().min(10) });

/** Public email tracking + one-click unsubscribe. Tokens are signed, so links can't be forged. */
export const trackingRoutes = defineRoutes('/t', (r) => {
  r.get('/o/:token', { auth: 'public', params: tokenParam }, async ({ params, res }) => {
    const claims = verifyLinkToken<{ s: string }>(params.token.replace(/\.gif$/, ''));
    if (claims && claims.s !== 'test')
      await campaignService
        .trackOpen(claims.s)
        .catch((err) => logger.warn({ err }, 'open tracking failed'));
    res.set({ 'Content-Type': 'image/gif', 'Cache-Control': 'no-store' }).send(PIXEL);
  });

  r.get('/c/:token', { auth: 'public', params: tokenParam }, async ({ params, res }) => {
    const claims = verifyLinkToken<{ s: string; u: string }>(params.token);
    if (!claims?.u || !/^https?:\/\//.test(claims.u)) return res.status(404).send('Link expired');
    if (claims.s !== 'test')
      await campaignService
        .trackClick(claims.s)
        .catch((err) => logger.warn({ err }, 'click tracking failed'));
    res.redirect(302, claims.u);
  });

  const unsubscribe = async (token: string) => {
    const claims = verifyLinkToken<{ s: string }>(token);
    if (!claims || claims.s === 'test') return false;
    await campaignService.unsubscribe(claims.s);
    return true;
  };

  r.get('/u/:token', { auth: 'public', params: tokenParam }, async ({ params, res }) => {
    const ok = await unsubscribe(params.token);
    res
      .type('html')
      .send(
        `<!doctype html><meta name="viewport" content="width=device-width"><body style="font-family:system-ui;display:grid;place-items:center;height:90vh;color:#111"><div style="text-align:center"><h2>${ok ? "You're unsubscribed" : 'This link has expired'}</h2><p style="color:#666">${ok ? "You won't receive marketing emails from this sender anymore." : ''}</p></div></body>`,
      );
  });
  // RFC 8058 one-click unsubscribe (Gmail / Yahoo bulk sender requirement).
  r.post('/u/:token', { auth: 'public', params: tokenParam }, async ({ params }) => {
    await unsubscribe(params.token);
    return { ok: true };
  });
});
