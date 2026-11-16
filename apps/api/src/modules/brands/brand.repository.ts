import { WorkspaceRepository } from '../../core/db/base.repository.js';
import type { DbClient, Prisma } from '../../core/db/prisma.js';
import type { Brand } from '../../generated/prisma/client.js';

export class BrandRepository extends WorkspaceRepository<{
  model: Brand;
  where: Prisma.BrandWhereInput;
  create: Prisma.BrandUncheckedCreateInput;
  update: Prisma.BrandUncheckedUpdateInput;
  orderBy: Prisma.BrandOrderByWithRelationInput;
  include: Prisma.BrandInclude;
}> {
  protected readonly resource = 'Brand';
  protected override readonly defaultOrderBy = { createdAt: 'asc' };
  protected delegate(db: DbClient) {
    return db.brand;
  }
}

export const brandRepository = new BrandRepository();
