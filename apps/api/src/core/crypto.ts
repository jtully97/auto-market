import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { env } from '../config/env.js';

const key = Buffer.from(env.ENCRYPTION_KEY, 'base64');
if (key.length !== 32) throw new Error('ENCRYPTION_KEY must decode to 32 bytes');

/** AES-256-GCM. Output: base64(iv).base64(tag).base64(ciphertext) */
export const encrypt = (plain: string): string => {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString('base64')).join('.');
};

export const decrypt = (payload: string): string => {
  const [iv, tag, data] = payload.split('.').map((p) => Buffer.from(p, 'base64'));
  if (!iv || !tag || !data) throw new Error('Malformed ciphertext');
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
};

export const randomToken = (bytes = 32): string => randomBytes(bytes).toString('base64url');
export const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');
