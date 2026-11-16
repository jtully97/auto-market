import { randomUUID } from 'node:crypto';
import { prisma } from '../../core/db/prisma.js';
import { BadRequestError, NotFoundError } from '../../core/errors.js';
import type { WorkspaceContext } from '../../core/http/types.js';
import type { MediaAsset } from '../../generated/prisma/client.js';
import { storage } from '../../integrations/storage/storage.js';

const ALLOWED = /^(image\/(png|jpe?g|webp|gif)|video\/(mp4|quicktime|webm))$/;
export const MAX_UPLOAD_BYTES = 500 * 1024 * 1024;

const ext = (mime: string) =>
  mime.split('/')[1]?.replace('quicktime', 'mov').replace('jpeg', 'jpg') ?? 'bin';
export const mediaKey = (workspaceId: string, mime: string) =>
  `workspaces/${workspaceId}/media/${randomUUID()}.${ext(mime)}`;

export const presentMedia = async (m: MediaAsset) => ({
  id: m.id,
  kind: m.kind,
  source: m.source,
  url: await storage.readUrl(m.storageKey),
  mimeType: m.mimeType,
  sizeBytes: m.sizeBytes,
  width: m.width,
  height: m.height,
  durationSec: m.durationSec,
  altText: m.altText,
  aiGenerationId: m.aiGenerationId,
  createdAt: m.createdAt,
});

export const mediaService = {
  async upload(ws: WorkspaceContext, file: Express.Multer.File | undefined, brandId?: string) {
    if (!file) throw new BadRequestError('No file uploaded');
    if (!ALLOWED.test(file.mimetype))
      throw new BadRequestError('Upload a PNG, JPG, WEBP, GIF, MP4, MOV or WEBM file');
    const key = mediaKey(ws.id, file.mimetype);
    await storage.put(key, file.buffer, file.mimetype);
    const asset = await prisma.mediaAsset.create({
      data: {
        workspaceId: ws.id,
        brandId,
        kind: file.mimetype.startsWith('video') ? 'VIDEO' : 'IMAGE',
        storageKey: key,
        url: key,
        mimeType: file.mimetype,
        sizeBytes: file.size,
      },
    });
    return presentMedia(asset);
  },

  /** Step 1 of a direct upload: get a signed URL (GCS) or fall back to multipart. */
  async createUpload(ws: WorkspaceContext, mimeType: string, size: number) {
    if (!ALLOWED.test(mimeType))
      throw new BadRequestError('Upload a PNG, JPG, WEBP, GIF, MP4, MOV or WEBM file');
    if (size > MAX_UPLOAD_BYTES) throw new BadRequestError('Files can be up to 500 MB');
    const key = mediaKey(ws.id, mimeType);
    const uploadUrl = await storage.uploadUrl(key, mimeType);
    return uploadUrl ? { mode: 'direct' as const, uploadUrl, key } : { mode: 'multipart' as const };
  },

  /** Step 2: register the uploaded object. */
  async completeUpload(
    ws: WorkspaceContext,
    input: {
      key: string;
      mimeType: string;
      size: number;
      brandId?: string;
      width?: number;
      height?: number;
      durationSec?: number;
    },
  ) {
    if (!input.key.startsWith(`workspaces/${ws.id}/media/`))
      throw new BadRequestError('Invalid upload');
    if (!(await storage.exists(input.key)))
      throw new BadRequestError('Upload not found — try again');
    const asset = await prisma.mediaAsset.create({
      data: {
        workspaceId: ws.id,
        brandId: input.brandId,
        kind: input.mimeType.startsWith('video') ? 'VIDEO' : 'IMAGE',
        storageKey: input.key,
        url: input.key,
        mimeType: input.mimeType,
        sizeBytes: input.size,
        width: input.width,
        height: input.height,
        durationSec: input.durationSec,
      },
    });
    return presentMedia(asset);
  },

  async list(
    ws: WorkspaceContext,
    query: { page: number; pageSize: number; kind?: 'IMAGE' | 'VIDEO'; brandId?: string },
  ) {
    const where = {
      workspaceId: ws.id,
      ...(query.kind ? { kind: query.kind } : {}),
      ...(query.brandId ? { brandId: query.brandId } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.mediaAsset.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.mediaAsset.count({ where }),
    ]);
    return {
      items: await Promise.all(items.map(presentMedia)),
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    };
  },

  async remove(ws: WorkspaceContext, id: string) {
    const asset = await prisma.mediaAsset.findFirst({ where: { id, workspaceId: ws.id } });
    if (!asset) throw new NotFoundError('Media');
    await prisma.mediaAsset.delete({ where: { id } });
    await storage.delete(asset.storageKey);
  },
};
