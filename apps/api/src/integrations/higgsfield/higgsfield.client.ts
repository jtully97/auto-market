import { Webhook } from 'standardwebhooks';
import { env } from '../../config/env.js';
import { BadRequestError, ExternalServiceError } from '../../core/errors.js';

/**
 * Higgsfield REST client (https://docs.higgsfield.ai).
 * Every model shares one async lifecycle:
 *   POST /<endpoint-id>            -> { request_id, status_url, cancel_url }
 *   GET  /requests/:id/status      -> queued | in_progress | completed | failed | nsfw | canceled
 * We pass `hf_webhook` so completion is pushed to us; polling is the fallback.
 */
export type HiggsfieldStatus =
  'queued' | 'in_progress' | 'completed' | 'failed' | 'nsfw' | 'canceled';

export interface HiggsfieldResult {
  request_id: string;
  status: HiggsfieldStatus;
  error?: string | null;
  images?: { url: string }[];
  video?: { url: string };
}

const TERMINAL: HiggsfieldStatus[] = ['completed', 'failed', 'nsfw', 'canceled'];
export const isTerminal = (s: HiggsfieldStatus) => TERMINAL.includes(s);

const authHeader = () => {
  if (!env.HIGGSFIELD_API_KEY_ID || !env.HIGGSFIELD_API_KEY_SECRET) {
    throw new BadRequestError('Higgsfield is not configured (HIGGSFIELD_API_KEY_ID / SECRET)');
  }
  return `Key ${env.HIGGSFIELD_API_KEY_ID}:${env.HIGGSFIELD_API_KEY_SECRET}`;
};

const request = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
  const res = await fetch(`${env.HIGGSFIELD_BASE_URL}/${path.replace(/^\//, '')}`, {
    ...init,
    headers: { Authorization: authHeader(), 'Content-Type': 'application/json', ...init.headers },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new ExternalServiceError('Higgsfield', `${res.status} ${body.slice(0, 300)}`);
  }
  return (res.status === 202 || res.status === 204 ? {} : await res.json()) as T;
};

export const higgsfieldClient = {
  async submit(
    endpointId: string,
    body: Record<string, unknown>,
    idempotencyKey: string,
  ): Promise<{ requestId: string }> {
    const webhook = encodeURIComponent(`${env.API_URL}/v1/webhooks/higgsfield`);
    const data = await request<{ request_id: string }>(`${endpointId}?hf_webhook=${webhook}`, {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'Idempotency-Key': idempotencyKey },
    });
    return { requestId: data.request_id };
  },

  status: (requestId: string) => request<HiggsfieldResult>(`requests/${requestId}/status`),

  cancel: (requestId: string) => request<void>(`requests/${requestId}/cancel`, { method: 'POST' }),

  /** Verify a Standard Webhooks signature; returns the parsed envelope. */
  verifyWebhook(rawBody: string, headers: Record<string, string>) {
    if (!env.HIGGSFIELD_WEBHOOK_SECRET)
      throw new BadRequestError('Higgsfield webhook secret not configured');
    const wh = new Webhook(env.HIGGSFIELD_WEBHOOK_SECRET.replace(/^whsec_/, ''));
    return wh.verify(rawBody, headers) as {
      request_id: string;
      status: HiggsfieldStatus;
      error?: string | null;
      payload: Omit<HiggsfieldResult, 'request_id' | 'status'> | null;
    };
  },
};
