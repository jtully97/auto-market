import type { Paginated, PaginationQuery } from '@automarket/shared';
import type { WorkspaceRepository } from '../db/base.repository.js';
import type { WorkspaceContext } from '../http/types.js';

export interface CrudService<TModel, TCreate, TUpdate> {
  list(ws: WorkspaceContext, query: PaginationQuery): Promise<Paginated<TModel>>;
  get(ws: WorkspaceContext, id: string): Promise<TModel>;
  create(ws: WorkspaceContext, input: TCreate): Promise<TModel>;
  update(ws: WorkspaceContext, id: string, input: TUpdate): Promise<TModel>;
  remove(ws: WorkspaceContext, id: string): Promise<void>;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyRepo = WorkspaceRepository<any>;

/**
 * Default CRUD behaviour on top of a WorkspaceRepository. Override the hooks
 * (`searchWhere`, `beforeCreate`, `toCreateData`, `toUpdateData`) instead of
 * re-implementing the flow in every module.
 */
export abstract class BaseCrudService<
  TModel,
  TCreate,
  TUpdate,
  R extends AnyRepo = AnyRepo,
> implements CrudService<TModel, TCreate, TUpdate> {
  constructor(protected readonly repo: R) {}

  /** Fields to `contains`-search when `?search=` is provided. */
  protected searchFields: string[] = ['name'];

  protected searchWhere(search?: string): object | undefined {
    if (!search) return undefined;
    return {
      OR: this.searchFields.map((f) => ({ [f]: { contains: search, mode: 'insensitive' } })),
    };
  }

  protected async beforeCreate(_ws: WorkspaceContext, _input: TCreate): Promise<void> {}
  protected toCreateData(input: TCreate): object {
    return input as object;
  }
  protected toUpdateData(input: TUpdate): object {
    return input as object;
  }

  async list(ws: WorkspaceContext, query: PaginationQuery): Promise<Paginated<TModel>> {
    return this.repo.list(ws.id, {
      where: this.searchWhere(query.search),
      orderBy: query.sort ? { [query.sort]: query.order } : undefined,
      page: query.page,
      pageSize: query.pageSize,
    }) as Promise<Paginated<TModel>>;
  }

  async get(ws: WorkspaceContext, id: string): Promise<TModel> {
    return this.repo.getById(ws.id, id) as Promise<TModel>;
  }

  async create(ws: WorkspaceContext, input: TCreate): Promise<TModel> {
    await this.beforeCreate(ws, input);
    return this.repo.create(ws.id, this.toCreateData(input)) as Promise<TModel>;
  }

  async update(ws: WorkspaceContext, id: string, input: TUpdate): Promise<TModel> {
    return this.repo.update(ws.id, id, this.toUpdateData(input)) as Promise<TModel>;
  }

  async remove(ws: WorkspaceContext, id: string): Promise<void> {
    await this.repo.delete(ws.id, id);
  }
}
