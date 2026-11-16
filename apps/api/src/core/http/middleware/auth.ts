import type { NextFunction, Request, Response } from 'express';
import { getPlan } from '@automarket/shared';
import { ACCESS_COOKIE, verifyAccessToken } from '../../auth/jwt.js';
import { prisma, type WorkspaceRole } from '../../db/prisma.js';
import { BadRequestError, ForbiddenError, UnauthorizedError } from '../../errors.js';
import type { AuthMode } from '../types.js';

const ROLE_RANK: Record<WorkspaceRole, number> = { VIEWER: 0, EDITOR: 1, ADMIN: 2, OWNER: 3 };
export const hasRole = (role: WorkspaceRole, minimum: WorkspaceRole) =>
  ROLE_RANK[role] >= ROLE_RANK[minimum];

const readToken = (req: Request): string | undefined => {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);
  return req.cookies?.[ACCESS_COOKIE];
};

export const authenticate =
  (mode: AuthMode, minimumRole?: WorkspaceRole) =>
  async (req: Request, _res: Response, next: NextFunction) => {
    const token = readToken(req);
    const claims = token ? verifyAccessToken(token) : null;
    if (claims) req.user = { id: claims.sub, email: claims.email, name: claims.name };

    if (mode === 'public') return next();
    if (!req.user) throw new UnauthorizedError();

    const workspaceId = req.header('x-workspace-id');
    if (!workspaceId) {
      if (mode === 'workspace') throw new BadRequestError('Missing x-workspace-id header');
      return next();
    }

    const membership = await prisma.membership.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: req.user.id } },
      include: { workspace: { select: { id: true, name: true, planId: true, timezone: true } } },
    });
    if (!membership) throw new ForbiddenError('You are not a member of this workspace');
    if (minimumRole && !hasRole(membership.role, minimumRole)) {
      throw new ForbiddenError(`This needs ${minimumRole.toLowerCase()} access`);
    }

    const { workspace } = membership;
    req.workspace = {
      id: workspace.id,
      name: workspace.name,
      role: membership.role,
      planId: workspace.planId,
      plan: getPlan(workspace.planId),
      timezone: workspace.timezone,
    };
    next();
  };
