import type { PaginationQuery } from '@automarket/shared';
import type { CrudService } from '../service/base.service.js';
import { created, noContent } from './responses.js';
import type { WorkspaceContext } from './types.js';

type WsCtx = { workspace: WorkspaceContext };

/**
 * Generic REST controller for workspace-owned resources. Subclasses get
 * list/get/create/update/remove for free and override only what differs.
 * Handlers are arrow properties so they can be passed straight to routes.
 */
export abstract class CrudController<TModel, TCreate, TUpdate, TView = TModel> {
  constructor(protected readonly service: CrudService<TModel, TCreate, TUpdate>) {}

  /** View layer: map a model to its public JSON shape. */
  protected present(model: TModel): TView {
    return model as unknown as TView;
  }

  list = async ({ workspace, query }: WsCtx & { query: PaginationQuery }) => {
    const page = await this.service.list(workspace, query);
    return { ...page, items: page.items.map((m) => this.present(m)) };
  };

  get = async ({ workspace, params }: WsCtx & { params: { id: string } }) =>
    this.present(await this.service.get(workspace, params.id));

  create = async ({ workspace, body }: WsCtx & { body: TCreate }) =>
    created(this.present(await this.service.create(workspace, body)));

  update = async ({ workspace, params, body }: WsCtx & { params: { id: string }; body: TUpdate }) =>
    this.present(await this.service.update(workspace, params.id, body));

  remove = async ({ workspace, params }: WsCtx & { params: { id: string } }) => {
    await this.service.remove(workspace, params.id);
    return noContent();
  };
}
