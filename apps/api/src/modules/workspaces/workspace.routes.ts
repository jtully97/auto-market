import {
  createWorkspaceSchema,
  idParamsSchema,
  inviteMemberSchema,
  updateWorkspaceSchema,
  WORKSPACE_ROLES,
} from '@automarket/shared';
import { z } from 'zod';
import { created, noContent } from '../../core/http/responses.js';
import { defineRoutes } from '../../core/http/router.js';
import { workspaceService as svc } from './workspace.service.js';

export default defineRoutes('/workspaces', (r) => {
  r.post('/', { auth: 'user', body: createWorkspaceSchema }, async ({ user, body }) =>
    created(await svc.create(user, body.name)),
  );
  r.get('/current', {}, ({ workspace }) => svc.get(workspace));
  r.patch('/current', { role: 'ADMIN', body: updateWorkspaceSchema }, ({ workspace, body }) =>
    svc.update(workspace, body),
  );
  r.get('/current/members', {}, ({ workspace }) => svc.members(workspace));
  r.post(
    '/current/invitations',
    { role: 'ADMIN', body: inviteMemberSchema },
    ({ workspace, user, body }) => svc.invite(workspace, user, body.email, body.role),
  );
  r.post(
    '/invitations/accept',
    { auth: 'user', body: z.object({ token: z.string().min(10) }) },
    ({ user, body }) => svc.acceptInvite(user, body.token),
  );
  r.patch(
    '/current/members/:id',
    {
      role: 'ADMIN',
      params: idParamsSchema,
      body: z.object({ role: z.enum(WORKSPACE_ROLES).exclude(['OWNER']) }),
    },
    ({ workspace, params, body }) => svc.updateMemberRole(workspace, params.id, body.role),
  );
  r.delete(
    '/current/members/:id',
    { role: 'ADMIN', params: idParamsSchema },
    async ({ workspace, params }) => {
      await svc.removeMember(workspace, params.id);
      return noContent();
    },
  );
});
