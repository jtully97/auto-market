import nodemailer from 'nodemailer';
import { env } from '../../config/env.js';

export interface OutgoingEmail {
  to: string;
  subject: string;
  html: string;
  text?: string;
  fromName?: string;
  replyTo?: string;
  headers?: Record<string, string>;
}

/**
 * SMTP transport — works with Mailpit locally and any ESP in production
 * (SendGrid, Postmark, Mailgun, SES all expose SMTP). Swap the transport here
 * to move to an HTTP API without touching callers.
 */
const transport = nodemailer.createTransport(env.SMTP_URL);

export const mailer = {
  async send(msg: OutgoingEmail): Promise<{ messageId: string }> {
    const info = await transport.sendMail({
      from: msg.fromName
        ? `"${msg.fromName.replace(/"/g, '')}" <${env.EMAIL_FROM_ADDRESS}>`
        : env.EMAIL_FROM_ADDRESS,
      to: msg.to,
      subject: msg.subject,
      html: msg.html,
      text: msg.text,
      replyTo: msg.replyTo,
      headers: msg.headers,
    });
    return { messageId: info.messageId };
  },
};

/** Transactional emails (password reset, invites). */
export const sendTransactional = (to: string, subject: string, bodyHtml: string) =>
  mailer.send({
    to,
    subject,
    fromName: 'AutoMarket',
    html: `<div style="font-family:system-ui,sans-serif;max-width:560px;margin:auto;padding:24px;color:#111">${bodyHtml}<p style="color:#888;font-size:12px;margin-top:32px">AutoMarket · ${env.COMPANY_POSTAL_ADDRESS}</p></div>`,
  });
