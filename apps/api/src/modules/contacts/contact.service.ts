import { randomUUID } from 'node:crypto';
import { parse } from 'csv-parse';
import { contactSchema, type ContactInput } from '@automarket/shared';
import { prisma, type ContactStatus, type Prisma } from '../../core/db/prisma.js';
import { BadRequestError, NotFoundError } from '../../core/errors.js';
import { logger } from '../../core/logger.js';
import { enqueue } from '../../core/queue/queue.js';
import type { WorkspaceContext } from '../../core/http/types.js';
import { getPlan } from '@automarket/shared';
import { storage } from '../../integrations/storage/storage.js';
import { usageService } from '../usage/usage.service.js';

export interface ContactQuery {
  page: number;
  pageSize: number;
  search?: string;
  status?: ContactStatus;
  listId?: string;
  tag?: string;
}

const IMPORT_CHUNK = 500;
export const MAX_IMPORT_BYTES = 25 * 1024 * 1024;

export const contactService = {
  where(
    ws: WorkspaceContext,
    q: Omit<ContactQuery, 'page' | 'pageSize'>,
  ): Prisma.ContactWhereInput {
    return {
      workspaceId: ws.id,
      ...(q.status ? { status: q.status } : {}),
      ...(q.listId ? { lists: { some: { listId: q.listId } } } : {}),
      ...(q.tag ? { tags: { has: q.tag } } : {}),
      ...(q.search
        ? {
            OR: [
              { email: { contains: q.search, mode: 'insensitive' } },
              { firstName: { contains: q.search, mode: 'insensitive' } },
              { lastName: { contains: q.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
  },

  async list(ws: WorkspaceContext, q: ContactQuery) {
    const where = this.where(ws, q);
    const [items, total] = await Promise.all([
      prisma.contact.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: { lists: { select: { list: { select: { id: true, name: true } } } } },
      }),
      prisma.contact.count({ where }),
    ]);
    return {
      items: items.map(({ lists, ...c }) => ({ ...c, lists: lists.map((l) => l.list) })),
      page: q.page,
      pageSize: q.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / q.pageSize)),
    };
  },

  async assertListsOwned(ws: WorkspaceContext, listIds: string[]) {
    if (!listIds.length) return;
    const count = await prisma.contactList.count({
      where: { id: { in: listIds }, workspaceId: ws.id },
    });
    if (count !== new Set(listIds).size) throw new BadRequestError('Unknown list');
  },

  async create(ws: WorkspaceContext, input: ContactInput) {
    usageService.assertWithinLimit(
      ws,
      'contacts',
      await prisma.contact.count({ where: { workspaceId: ws.id } }),
      1,
      'contacts',
    );
    await this.assertListsOwned(ws, input.listIds);
    const { listIds, ...data } = input;
    return prisma.contact.create({
      data: {
        ...data,
        workspaceId: ws.id,
        source: 'manual',
        consentAt: new Date(),
        lists: { create: listIds.map((listId) => ({ listId })) },
      },
    });
  },

  async update(
    ws: WorkspaceContext,
    id: string,
    input: Partial<ContactInput> & { status?: ContactStatus },
  ) {
    const contact = await prisma.contact.findFirst({ where: { id, workspaceId: ws.id } });
    if (!contact) throw new NotFoundError('Contact');
    const { listIds, ...data } = input;
    if (listIds) await this.assertListsOwned(ws, listIds);
    return prisma.contact.update({
      where: { id },
      data: {
        ...data,
        ...(data.status === 'UNSUBSCRIBED' ? { unsubscribedAt: new Date() } : {}),
        ...(listIds
          ? { lists: { deleteMany: {}, create: listIds.map((listId) => ({ listId })) } }
          : {}),
      },
    });
  },

  async bulkDelete(ws: WorkspaceContext, ids: string[]) {
    const { count } = await prisma.contact.deleteMany({
      where: { id: { in: ids }, workspaceId: ws.id },
    });
    return { deleted: count };
  },

  async addToList(ws: WorkspaceContext, listId: string, contactIds: string[]) {
    await this.assertListsOwned(ws, [listId]);
    const owned = await prisma.contact.findMany({
      where: { id: { in: contactIds }, workspaceId: ws.id },
      select: { id: true },
    });
    const { count } = await prisma.contactListMember.createMany({
      data: owned.map((c) => ({ listId, contactId: c.id })),
      skipDuplicates: true,
    });
    return { added: count };
  },

  async removeFromList(ws: WorkspaceContext, listId: string, contactIds: string[]) {
    await this.assertListsOwned(ws, [listId]);
    const { count } = await prisma.contactListMember.deleteMany({
      where: { listId, contactId: { in: contactIds } },
    });
    return { removed: count };
  },

  /** Read just the header row so the UI can offer a column mapping. */
  async previewCsv(file: Express.Multer.File | undefined) {
    if (!file) throw new BadRequestError('Upload a CSV file');
    const rows: string[][] = [];
    const parser = parse(file.buffer.subarray(0, 64 * 1024), {
      relax_column_count: true,
      skip_empty_lines: true,
      to_line: 6,
      bom: true,
    });
    for await (const row of parser) rows.push(row as string[]);
    if (!rows.length) throw new BadRequestError('That file looks empty');
    return { headers: rows[0], sample: rows.slice(1) };
  },

  async startImport(
    ws: WorkspaceContext,
    file: Express.Multer.File | undefined,
    opts: { mapping: Record<string, string>; listId?: string; tags: string[] },
  ) {
    if (!file) throw new BadRequestError('Upload a CSV file');
    if (!Object.values(opts.mapping).includes('email'))
      throw new BadRequestError('Map one column to Email');
    if (opts.listId) await this.assertListsOwned(ws, [opts.listId]);
    const storageKey = `workspaces/${ws.id}/imports/${randomUUID()}.csv`;
    await storage.put(storageKey, file.buffer, 'text/csv');
    const record = await prisma.contactImport.create({
      data: { workspaceId: ws.id, fileName: file.originalname.slice(0, 200) },
    });
    await enqueue('contacts.import', {
      importId: record.id,
      storageKey,
      mapping: opts.mapping,
      listId: opts.listId,
      tags: opts.tags,
    });
    return record;
  },

  getImport(ws: WorkspaceContext, id: string) {
    return prisma.contactImport.findFirstOrThrow({ where: { id, workspaceId: ws.id } });
  },

  /** Worker: stream the CSV, validate rows, upsert in chunks, respect plan contact limits. */
  async processImport(data: {
    importId: string;
    storageKey: string;
    mapping: Record<string, string>;
    listId?: string;
    tags: string[];
  }) {
    const record = await prisma.contactImport.findUniqueOrThrow({
      where: { id: data.importId },
      include: { workspace: true },
    });
    await prisma.contactImport.update({ where: { id: record.id }, data: { status: 'PROCESSING' } });
    const workspaceId = record.workspaceId;
    const limit = getPlan(record.workspace.planId).limits.contacts;
    let existingCount = await prisma.contact.count({ where: { workspaceId } });
    const stats = { totalRows: 0, imported: 0, updated: 0, skipped: 0 };
    const errors: { row: number; message: string }[] = [];

    try {
      const parser = parse(await storage.get(data.storageKey), {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        bom: true,
        relax_column_count: true,
      });
      let chunk: ContactInput[] = [];
      const flush = async () => {
        if (!chunk.length) return;
        const emails = chunk.map((c) => c.email);
        const existing = new Set(
          (
            await prisma.contact.findMany({
              where: { workspaceId, email: { in: emails } },
              select: { email: true },
            })
          ).map((c) => c.email),
        );
        const fresh = chunk.filter((c) => !existing.has(c.email));
        const allowed = Math.max(0, limit - existingCount);
        const toCreate = fresh.slice(0, allowed);
        stats.skipped += fresh.length - toCreate.length;
        if (fresh.length > toCreate.length)
          errors.push({ row: stats.totalRows, message: `Plan contact limit (${limit}) reached` });

        await prisma.contact.createMany({
          data: toCreate.map(({ listIds: _l, ...c }) => ({
            ...c,
            workspaceId,
            source: 'import',
            consentAt: new Date(),
          })),
          skipDuplicates: true,
        });
        existingCount += toCreate.length;
        stats.imported += toCreate.length;

        for (const c of chunk.filter((c) => existing.has(c.email))) {
          await prisma.contact.update({
            where: { workspaceId_email: { workspaceId, email: c.email } },
            data: {
              firstName: c.firstName || undefined,
              lastName: c.lastName || undefined,
              phone: c.phone || undefined,
              ...(c.tags.length ? { tags: { push: c.tags } } : {}),
            },
          });
          stats.updated++;
        }

        if (data.listId) {
          const ids = await prisma.contact.findMany({
            where: { workspaceId, email: { in: emails } },
            select: { id: true },
          });
          await prisma.contactListMember.createMany({
            data: ids.map((c) => ({ listId: data.listId!, contactId: c.id })),
            skipDuplicates: true,
          });
        }
        chunk = [];
        await prisma.contactImport.update({ where: { id: record.id }, data: stats });
      };

      for await (const row of parser as AsyncIterable<Record<string, string>>) {
        stats.totalRows++;
        const mapped: Record<string, unknown> = { tags: [...data.tags], attributes: {} };
        for (const [column, field] of Object.entries(data.mapping)) {
          const value = row[column]?.trim();
          if (!value) continue;
          if (field === 'tags')
            (mapped.tags as string[]).push(
              ...value
                .split(/[;,|]/)
                .map((t) => t.trim())
                .filter(Boolean),
            );
          else if (field.startsWith('attr:'))
            (mapped.attributes as Record<string, string>)[field.slice(5)] = value;
          else mapped[field] = value;
        }
        const parsed = contactSchema.safeParse(mapped);
        if (!parsed.success) {
          stats.skipped++;
          if (errors.length < 100)
            errors.push({
              row: stats.totalRows,
              message: parsed.error.issues[0]?.message ?? 'Invalid row',
            });
          continue;
        }
        chunk.push(parsed.data);
        if (chunk.length >= IMPORT_CHUNK) await flush();
      }
      await flush();
      await prisma.contactImport.update({
        where: { id: record.id },
        data: { ...stats, errors, status: 'COMPLETED', completedAt: new Date() },
      });
    } catch (err) {
      logger.error({ err, importId: record.id }, 'contact import failed');
      await prisma.contactImport.update({
        where: { id: record.id },
        data: {
          ...stats,
          status: 'FAILED',
          errors: [...errors, { row: stats.totalRows, message: 'Could not read the file' }],
          completedAt: new Date(),
        },
      });
    } finally {
      await storage.delete(data.storageKey);
    }
  },
};
