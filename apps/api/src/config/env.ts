import { z } from 'zod';

const bool = z
  .enum(['true', 'false', '1', '0'])
  .optional()
  .transform((v) => v === 'true' || v === '1');

const optional = z
  .string()
  .optional()
  .transform((v) => (v === '' ? undefined : v));

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  /** Proxy hops in front of the API (Cloud Run LB + web proxy = 2) so req.ip is the real client. */
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(1),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  /** Public URL of the API (used for OAuth callbacks, webhooks, tracking links). */
  API_URL: z.url().default('http://localhost:4000'),
  /** Public URL of the web app. */
  WEB_URL: z.url().default('http://localhost:3000'),
  DATABASE_URL: z.string().min(1),

  JWT_SECRET: z.string().min(32),
  /** 32 bytes, base64 — encrypts OAuth tokens at rest. `openssl rand -base64 32` */
  ENCRYPTION_KEY: z.string().min(40),
  COOKIE_DOMAIN: optional,
  COOKIE_SECURE: bool,

  OPENAI_API_KEY: optional,
  OPENAI_TEXT_MODEL: z.string().default('gpt-5-mini'),
  OPENAI_ANALYST_MODEL: z.string().default('gpt-5'),
  OPENAI_IMAGE_MODEL: z.string().default('gpt-image-2'),

  HIGGSFIELD_API_KEY_ID: optional,
  HIGGSFIELD_API_KEY_SECRET: optional,
  HIGGSFIELD_WEBHOOK_SECRET: optional,
  HIGGSFIELD_BASE_URL: z.url().default('https://api.higgsfield.ai'),
  HIGGSFIELD_IMAGE_ENDPOINT: z.string().default('higgsfield-ai/soul/standard'),
  HIGGSFIELD_TEXT_TO_VIDEO_ENDPOINT: z.string().default('wan/v2.6/text-to-video'),
  HIGGSFIELD_IMAGE_TO_VIDEO_ENDPOINT: z.string().default('wan/v2.6/image-to-video'),

  STRIPE_SECRET_KEY: optional,
  STRIPE_WEBHOOK_SECRET: optional,

  SMTP_URL: z.string().default('smtp://localhost:1025'),
  EMAIL_FROM_ADDRESS: z.string().default('hello@automarket.local'),
  /** Postal address required in marketing email footers (CAN-SPAM). */
  COMPANY_POSTAL_ADDRESS: z.string().default('123 Main St, Anytown, USA'),
  EMAIL_BATCH_SIZE: z.coerce.number().default(200),

  STORAGE_DRIVER: z.enum(['local', 'gcs']).default('local'),
  GCS_BUCKET: optional,
  LOCAL_STORAGE_DIR: z.string().default('./.uploads'),

  META_APP_ID: optional,
  META_APP_SECRET: optional,
  TIKTOK_CLIENT_KEY: optional,
  TIKTOK_CLIENT_SECRET: optional,
  GOOGLE_CLIENT_ID: optional,
  GOOGLE_CLIENT_SECRET: optional,
  LINKEDIN_CLIENT_ID: optional,
  LINKEDIN_CLIENT_SECRET: optional,
  X_CLIENT_ID: optional,
  X_CLIENT_SECRET: optional,
});

export type Env = z.infer<typeof schema>;

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:', z.prettifyError(parsed.error));
  process.exit(1);
}

export const env: Env = parsed.data;
export const isProd = env.NODE_ENV === 'production';
