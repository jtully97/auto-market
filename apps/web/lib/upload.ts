'use client';

import { api } from './api/client';
import type { Media } from './api/types';

/**
 * Upload a file. In production (GCS) the browser PUTs straight to the bucket via
 * a signed URL — bypassing request size limits; locally it falls back to multipart.
 */
export async function uploadMedia(file: File, brandId?: string): Promise<Media> {
  const plan = await api<
    { mode: 'direct'; uploadUrl: string; key: string } | { mode: 'multipart' }
  >('/media/uploads', {
    method: 'POST',
    body: { mimeType: file.type, size: file.size },
  });
  if (plan.mode === 'direct') {
    const put = await fetch(plan.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': file.type },
      body: file,
    });
    if (!put.ok) throw new Error('Upload failed — please try again');
    return api<Media>('/media/uploads/complete', {
      method: 'POST',
      body: { key: plan.key, mimeType: file.type, size: file.size, brandId },
    });
  }
  const form = new FormData();
  form.set('file', file);
  return api<Media>('/media', { method: 'POST', body: form, query: { brandId } });
}
