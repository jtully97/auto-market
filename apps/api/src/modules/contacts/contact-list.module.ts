import { contactListSchema } from '@automarket/shared';
import type { z } from 'zod';
import { WorkspaceRepository } from '../../core/db/base.repository.js';
import type { DbClient, Prisma } from '../../core/db/prisma.js';
import { CrudController } from '../../core/http/base.controller.js';
import { BaseCrudService } from '../../core/service/base.service.js';
import type { ContactList } from '../../generated/prisma/client.js';

type ListInput = { name: string; description?: string };

/** Model */
export class ContactListRepository extends WorkspaceRepository<{
  model: ContactList;
  where: Prisma.ContactListWhereInput;
  create: Prisma.ContactListUncheckedCreateInput;
  update: Prisma.ContactListUncheckedUpdateInput;
  orderBy: Prisma.ContactListOrderByWithRelationInput;
  include: Prisma.ContactListInclude;
}> {
  protected readonly resource = 'List';
  protected delegate(db: DbClient) {
    return db.contactList;
  }
}

/** Service — nothing custom needed: the base CRUD flow covers it. */
export class ContactListService extends BaseCrudService<
  ContactList,
  ListInput,
  Partial<ListInput>,
  ContactListRepository
> {}

/** View — adds the member count to every list. */
class ContactListController extends CrudController<
  ContactList & { _count?: { members: number } },
  ListInput,
  Partial<ListInput>
> {
  protected override present(l: ContactList & { _count?: { members: number } }) {
    return { ...l, memberCount: l._count?.members ?? 0 };
  }
}

class CountingListRepository extends ContactListRepository {
  override list(workspaceId: string, opts: Parameters<ContactListRepository['list']>[1] = {}) {
    return super.list(workspaceId, { ...opts, include: { _count: { select: { members: true } } } });
  }
}

export const contactListRepository = new CountingListRepository();
export const contactListService = new ContactListService(contactListRepository);
export const contactListController = new ContactListController(contactListService);
export const contactListBody = contactListSchema satisfies z.ZodType<ListInput>;
