import { AI_ACTIONS, AI_ACTION_PRICING, CREDIT_PACKS, creditsFor } from '@automarket/shared';
import type { WorkspaceContext } from '../../core/http/types.js';
import { creditService } from './credit.service.js';

export const creditController = {
  balance: ({ workspace }: { workspace: WorkspaceContext }) => creditService.balance(workspace.id),

  history: ({
    workspace,
    query,
  }: {
    workspace: WorkspaceContext;
    query: { page: number; pageSize: number };
  }) => creditService.history(workspace.id, query.page, query.pageSize),

  /** Public price list so the UI can show "this will cost N credits" before any action. */
  pricing: () => ({
    actions: AI_ACTIONS.map((action) => ({
      action,
      label: AI_ACTION_PRICING[action].label,
      credits: creditsFor(action),
    })),
    packs: CREDIT_PACKS,
  }),
};
