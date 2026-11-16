import type { RouteModule } from './core/http/router.js';
import ai from './modules/ai/ai.routes.js';
import analytics from './modules/analytics/analytics.routes.js';
import auth from './modules/auth/auth.routes.js';
import billing from './modules/billing/billing.routes.js';
import brands from './modules/brands/brand.routes.js';
import campaigns from './modules/campaigns/campaign.routes.js';
import contacts, { contactListRoutes } from './modules/contacts/contact.routes.js';
import credits from './modules/credits/credit.routes.js';
import dashboard from './modules/dashboard/dashboard.routes.js';
import media from './modules/media/media.routes.js';
import posts from './modules/posts/post.routes.js';
import socialAccounts from './modules/social-accounts/social-account.routes.js';
import webhooks from './modules/webhooks/webhook.routes.js';
import workspaces from './modules/workspaces/workspace.routes.js';

/** Versioned API modules, mounted under /v1. */
export const apiModules: RouteModule[] = [
  auth,
  workspaces,
  brands,
  dashboard,
  socialAccounts,
  media,
  posts,
  ai,
  credits,
  billing,
  analytics,
  contacts,
  contactListRoutes,
  campaigns,
  webhooks,
];
