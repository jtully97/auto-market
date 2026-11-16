import type { Paginated } from '@automarket/shared';
import { NotFoundError } from '../errors.js';
import { prisma, type DbClient } from './prisma.js';

/**
 * The subset of a Prisma model delegate the base repository relies on.
 * Typed loosely on the inside; the public surface of BaseRepository is fully typed.
 */
interface ModelDelegate {
  findFirst(args: unknown): Promise<unknown>;
  findMany(args: unknown): Promise<unknown[]>;
  count(args: unknown): Promise<number>;
  create(args: unknown): Promise<unknown>;
  update(args: unknown): Promise<unknown>;
  delete(args: unknown): Promise<unknown>;
}

export interface ListOptions<TWhere, TOrderBy, TInclude> {
  where?: TWhere;
  orderBy?: TOrderBy | TOrderBy[];
  include?: TInclude;
  page?: number;
  pageSize?: number;
}

export interface FindOptions<TInclude> {
  include?: TInclude;
}

type ModelTypes = {
  model: unknown;
  where: object;
  create: object;
  update: object;
  orderBy?: object;
  include?: object;
};

/**
 * Generic, workspace-scoped repository. Every query is automatically filtered
 * by `workspaceId`, so tenant isolation is enforced in one place instead of in
 * every service. Subclasses only declare their model and any custom queries.
 *
 *   class PostRepository extends WorkspaceRepository<{ model: Post; where: Prisma.PostWhereInput; ... }> {
 *     protected readonly resource = 'Post';
 *     protected delegate(db: DbClient) { return db.post; }
 *   }
 */
export abstract class WorkspaceRepository<T extends ModelTypes> {
  protected abstract readonly resource: string;
  protected abstract delegate(db: DbClient): unknown;
  protected readonly defaultOrderBy: object = { createdAt: 'desc' };

  constructor(protected readonly db: DbClient = prisma) {}

  /** Rebind to a transaction client: `repo.with(tx).create(...)`. */
  with(tx: DbClient): this {
    const Ctor = this.constructor as new (db: DbClient) => this;
    return new Ctor(tx);
  }

  protected get model(): ModelDelegate {
    return this.delegate(this.db) as ModelDelegate;
  }

  protected scope(workspaceId: string, where?: T['where']): T['where'] {
    return { ...(where ?? {}), workspaceId } as T['where'];
  }

  async findById(
    workspaceId: string,
    id: string,
    opts: FindOptions<T['include']> = {},
  ): Promise<T['model'] | null> {
    return (await this.model.findFirst({
      where: this.scope(workspaceId, { id } as T['where']),
      ...opts,
    })) as T['model'] | null;
  }

  async getById(
    workspaceId: string,
    id: string,
    opts: FindOptions<T['include']> = {},
  ): Promise<T['model']> {
    const row = await this.findById(workspaceId, id, opts);
    if (!row) throw new NotFoundError(this.resource);
    return row;
  }

  async findOne(
    workspaceId: string,
    where: T['where'],
    opts: FindOptions<T['include']> = {},
  ): Promise<T['model'] | null> {
    return (await this.model.findFirst({ where: this.scope(workspaceId, where), ...opts })) as
      T['model'] | null;
  }

  async findMany(
    workspaceId: string,
    opts: Omit<
      ListOptions<T['where'], NonNullable<T['orderBy']>, T['include']>,
      'page' | 'pageSize'
    > & { take?: number } = {},
  ): Promise<T['model'][]> {
    return (await this.model.findMany({
      where: this.scope(workspaceId, opts.where),
      orderBy: opts.orderBy ?? this.defaultOrderBy,
      include: opts.include,
      take: opts.take,
    })) as T['model'][];
  }

  async list(
    workspaceId: string,
    opts: ListOptions<T['where'], NonNullable<T['orderBy']>, T['include']> = {},
  ): Promise<Paginated<T['model']>> {
    const page = opts.page ?? 1;
    const pageSize = opts.pageSize ?? 25;
    const where = this.scope(workspaceId, opts.where);
    const [items, total] = await Promise.all([
      this.model.findMany({
        where,
        orderBy: opts.orderBy ?? this.defaultOrderBy,
        include: opts.include,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.model.count({ where }),
    ]);
    return {
      items: items as T['model'][],
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  count(workspaceId: string, where?: T['where']): Promise<number> {
    return this.model.count({ where: this.scope(workspaceId, where) });
  }

  async create(
    workspaceId: string,
    data: Omit<T['create'], 'workspace' | 'workspaceId'>,
    opts: FindOptions<T['include']> = {},
  ): Promise<T['model']> {
    return (await this.model.create({ data: { ...data, workspaceId }, ...opts })) as T['model'];
  }

  async update(
    workspaceId: string,
    id: string,
    data: T['update'],
    opts: FindOptions<T['include']> = {},
  ): Promise<T['model']> {
    await this.getById(workspaceId, id); // ownership check
    return (await this.model.update({ where: { id }, data, ...opts })) as T['model'];
  }

  async delete(workspaceId: string, id: string): Promise<void> {
    await this.getById(workspaceId, id);
    await this.model.delete({ where: { id } });
  }
}
