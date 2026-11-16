import { env } from '../../config/env.js';
import { signLinkToken } from '../../core/auth/jwt.js';

export interface RenderContact {
  email: string;
  firstName: string | null;
  lastName: string | null;
  attributes: unknown;
}

const escapeHtml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

/** {{firstName}}, {{lastName}}, {{email}}, {{attr.company}} with optional fallback: {{firstName|there}} */
export const personalize = (template: string, c: RenderContact, html = true) =>
  template.replace(
    /\{\{\s*([\w.]+)\s*(?:\|\s*([^}]*))?\}\}/g,
    (_m, key: string, fallback?: string) => {
      const attrs = (c.attributes ?? {}) as Record<string, string>;
      const value =
        key === 'firstName'
          ? c.firstName
          : key === 'lastName'
            ? c.lastName
            : key === 'email'
              ? c.email
              : key.startsWith('attr.')
                ? attrs[key.slice(5)]
                : undefined;
      const out = value || fallback || '';
      return html ? escapeHtml(out) : out;
    },
  );

export const unsubscribeUrl = (sendId: string) =>
  `${env.API_URL}/t/u/${signLinkToken({ s: sendId })}`;

/**
 * Final HTML for one recipient: personalization, click-tracked links, open
 * pixel, and the compliance footer (unsubscribe + postal address).
 */
export const renderEmail = (opts: {
  html: string;
  previewText?: string | null;
  brandName: string;
  sendId: string;
  contact: RenderContact;
}) => {
  let html = personalize(opts.html, opts.contact);
  html = html.replace(
    /href="(https?:\/\/[^"]+)"/g,
    (_m, url: string) => `href="${env.API_URL}/t/c/${signLinkToken({ s: opts.sendId, u: url })}"`,
  );
  const preheader = opts.previewText
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(personalize(opts.previewText, opts.contact, false))}</div>`
    : '';
  const footer = `<div style="font-family:system-ui,sans-serif;font-size:12px;color:#888;text-align:center;padding:24px 16px">
You are receiving this because you subscribed to ${escapeHtml(opts.brandName)}.<br/>
<a href="${unsubscribeUrl(opts.sendId)}" style="color:#888">Unsubscribe</a> · ${escapeHtml(env.COMPANY_POSTAL_ADDRESS)}</div>`;
  const pixel = `<img src="${env.API_URL}/t/o/${signLinkToken({ s: opts.sendId })}.gif" width="1" height="1" alt="" style="display:block;border:0"/>`;
  const body = /<\/body>/i.test(html)
    ? html.replace(/<\/body>/i, `${footer}${pixel}</body>`)
    : `${html}${footer}${pixel}`;
  return /<body[^>]*>/i.test(body)
    ? body.replace(/(<body[^>]*>)/i, `$1${preheader}`)
    : `${preheader}${body}`;
};

export const htmlToText = (html: string) =>
  html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, '$2 ($1)')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
