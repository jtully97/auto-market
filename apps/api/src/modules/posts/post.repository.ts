import { WorkspaceRepository } from '../../core/db/base.repository.js';
import type { DbClient, Prisma } from '../../core/db/prisma.js';
import type { Post } from '../../generated/prisma/client.js';

export const postInclude = {
  targets: { include: { socialAccount: true } },
  media: { include: { media: true }, orderBy: { position: 'asc' } },
  brand: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true } },
} satisfies Prisma.PostInclude;

export type PostWithRelations = Prisma.PostGetPayload<{ include: typeof postInclude }>;

export class PostRepository extends WorkspaceRepository<{
  model: Post;
  where: Prisma.PostWhereInput;
  create: Prisma.PostUncheckedCreateInput;
  update: Prisma.PostUncheckedUpdateInput;
  orderBy: Prisma.PostOrderByWithRelationInput;
  include: Prisma.PostInclude;
}> {
  protected readonly resource = 'Post';
  protected delegate(db: DbClient) {
    return db.post;
  }

  getFull(workspaceId: string, id: string) {
    return this.getById(workspaceId, id, { include: postInclude }) as Promise<PostWithRelations>;
  }

  /** Calendar range query. */
  inRange(workspaceId: string, where: Prisma.PostWhereInput, page: number, pageSize: number) {
    return this.list(workspaceId, {
      where,
      include: postInclude,
      orderBy: [{ scheduledAt: 'asc' }, { createdAt: 'desc' }],
      page,
      pageSize,
    }) as Promise<{
      items: PostWithRelations[];
      page: number;
      pageSize: number;
      total: number;
      totalPages: number;
    }>;
  }
}

export const postRepository = new PostRepository();
