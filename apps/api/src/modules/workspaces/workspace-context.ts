import { getPlan } from '@automarket/shared';
import { prisma } from '../../core/db/prisma.js';
import type { AuthUser, WorkspaceContext } from '../../core/http/types.js';

/** Build a WorkspaceContext + owner identity for background jobs acting on a workspace's behalf. */
export const systemContextFor = async (
  workspaceId: string,
): Promise<{ ws: WorkspaceContext; owner: AuthUser }> => {
  const workspace = await prisma.workspace.findUniqueOrThrow({
    where: { id: workspaceId },
    include: { memberships: { where: { role: 'OWNER' }, include: { user: true }, take: 1 } },
  });
  const owner = workspace.memberships[0]!.user;
  return {
    ws: {
      id: workspace.id,
      name: workspace.name,
      role: 'OWNER',
      planId: workspace.planId,
      plan: getPlan(workspace.planId),
      timezone: workspace.timezone,
    },
    owner: { id: owner.id, email: owner.email, name: owner.name },
  };
};
