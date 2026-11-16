import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Storage } from '@google-cloud/storage';
import { env } from '../../config/env.js';
import { ExternalServiceError } from '../../core/errors.js';

export interface StorageDriver {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  /** A URL a browser or social platform can fetch. */
  readUrl(key: string, ttlSeconds?: number): Promise<string>;
  /** Direct-to-bucket upload URL (bypasses Cloud Run's 32 MB request limit). Null when unsupported. */
  uploadUrl(key: string, contentType: string): Promise<string | null>;
  exists(key: string): Promise<boolean>;
}

class LocalStorageDriver implements StorageDriver {
  private readonly root = path.resolve(env.LOCAL_STORAGE_DIR);
  private file(key: string) {
    const resolved = path.resolve(this.root, key);
    if (!resolved.startsWith(this.root)) throw new Error('Invalid storage key');
    return resolved;
  }
  async put(key: string, body: Buffer) {
    await mkdir(path.dirname(this.file(key)), { recursive: true });
    await writeFile(this.file(key), body);
  }
  get(key: string) {
    return readFile(this.file(key));
  }
  async delete(key: string) {
    await rm(this.file(key), { force: true });
  }
  async readUrl(key: string) {
    return `${env.API_URL}/media/${key}`;
  }
  async uploadUrl() {
    return null;
  }
  async exists(key: string) {
    return readFile(this.file(key)).then(
      () => true,
      () => false,
    );
  }
  get directory() {
    return this.root;
  }
}

class GcsStorageDriver implements StorageDriver {
  private readonly bucket = new Storage().bucket(env.GCS_BUCKET ?? '');
  async put(key: string, body: Buffer, contentType: string) {
    await this.bucket.file(key).save(body, { contentType, resumable: false });
  }
  async get(key: string) {
    const [data] = await this.bucket.file(key).download();
    return data;
  }
  async delete(key: string) {
    await this.bucket.file(key).delete({ ignoreNotFound: true });
  }
  async readUrl(key: string, ttlSeconds = 60 * 60 * 24) {
    const [url] = await this.bucket.file(key).getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: Date.now() + ttlSeconds * 1000,
    });
    return url;
  }
  async uploadUrl(key: string, contentType: string) {
    const [url] = await this.bucket.file(key).getSignedUrl({
      version: 'v4',
      action: 'write',
      contentType,
      expires: Date.now() + 15 * 60 * 1000,
    });
    return url;
  }
  async exists(key: string) {
    const [exists] = await this.bucket.file(key).exists();
    return exists;
  }
}

export const storage: StorageDriver =
  env.STORAGE_DRIVER === 'gcs' ? new GcsStorageDriver() : new LocalStorageDriver();
export const localStorageDir =
  env.STORAGE_DRIVER === 'local' ? path.resolve(env.LOCAL_STORAGE_DIR) : null;

/** Copy remote media (e.g. AI output with a 7-day expiry) into our bucket. */
export const putFromUrl = async (
  key: string,
  url: string,
): Promise<{ contentType: string; size: number }> => {
  const res = await fetch(url);
  if (!res.ok)
    throw new ExternalServiceError('Storage', `Could not download ${url} (${res.status})`);
  const contentType = res.headers.get('content-type') ?? 'application/octet-stream';
  const body = Buffer.from(await res.arrayBuffer());
  await storage.put(key, body, contentType);
  return { contentType, size: body.length };
};
