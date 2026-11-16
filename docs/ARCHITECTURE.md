# Architecture

```
Browser ──► web (Next.js, Cloud Run) ──/api/* proxy──► api (Express, Cloud Run) ──► Cloud SQL (Postgres)
                                                          ▲    │                      ▲
Social platforms / Stripe / Higgsfield ── webhooks ───────┘    └─ enqueue jobs ──► pg-boss tables
                                                                                      │
                                         worker (same image, Cloud Run, always-on CPU) ◄┘
                                           publish posts · send email batches · import CSVs
                                           sync metrics · refresh tokens · poll AI · credit maintenance · autopilot
```

- The **web app** proxies `/api/*` to the API so session cookies stay first-party (httpOnly, SameSite=Lax), and the API URL is runtime config (`API_INTERNAL_URL`) rather than baked into the build.
- The **API** is public because OAuth callbacks, webhooks and email tracking links hit it directly.
- The **worker** runs the same image with `node dist/worker.js`. Jobs live in Postgres (pg-boss), so scheduled posts and campaigns need no extra infrastructure; delayed jobs (`startAfter`) fire them on time.
- Media lives in a private GCS bucket. Browsers upload straight to it with signed URLs (avoids Cloud Run's 32 MB request limit) and read through short-lived signed URLs, which are also what the social platforms fetch when publishing.

## API layering (MVC)

```
routes (declarative)  →  controller (thin)  →  service (business rules)  →  repository (data)  →  Prisma
                                                         ↓
                                              integrations (OpenAI, Higgsfield, Stripe, social, storage, mail)
```

Shared building blocks in `apps/api/src/core` keep modules small:

| Piece                                   | What it removes from every module                                                                                                |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `RouteBuilder` / `defineRoutes`         | Auth, minimum role, zod validation of body/query/params, uploads, error forwarding, response serialisation — one line per route  |
| `WorkspaceRepository<T>`                | Tenant scoping (`workspaceId` on every query), pagination, ownership checks on update/delete                                     |
| `BaseCrudService`                       | The list/get/create/update/remove flow with hooks (`beforeCreate`, `toCreateData`, `searchWhere`)                                |
| `CrudController`                        | Standard REST handlers plus a `present()` view hook                                                                              |
| `AppError` hierarchy + error middleware | Consistent `{ error: { code, message, details } }` bodies; `PLAN_LIMIT` / `INSUFFICIENT_CREDITS` drive upgrade prompts in the UI |
| Typed job registry (`core/queue`)       | Job names, payload types, retry policies and cron schedules in one place; handlers delegate to services                          |

`modules/contacts/contact-list.module.ts` is the smallest example: a full CRUD resource is a repository declaration, an empty service subclass and a controller with one `present()` override.

Social platforms are a strategy registry (`integrations/social/registry.ts`). Each provider extends `OAuth2Provider` (shared OAuth, PKCE, token refresh, HTTP error mapping) and implements only `connect`, `publish`, `fetchPostMetrics` and `fetchAccountMetrics`.

## Shared package

`packages/shared` is the single source of truth for things both apps must agree on: plans and limits, credit prices, platform rules (`validateForPlatform` runs live in the composer _and_ authoritatively in the API), and the zod request schemas.

## Data model highlights

- **Tenancy**: `Workspace` ← `Membership` (OWNER/ADMIN/EDITOR/VIEWER) → `User`. A workspace has one or more `Brand`s — the brand profile is the AI's "lane" context.
- **Publishing**: `Post` → `PostTarget` (one per social account, with optional caption override and its own status), `PostMetric` snapshots for analytics. `PostingSchedule` defines the queue's slots.
- **Credits**: `CreditLot` (buckets with expiry), `CreditReservation` (holds), `CreditTransaction` (append-only ledger). See [PRICING.md](PRICING.md).
- **Email**: `Contact`, `ContactList`, `EmailCampaign`, `EmailSend` (one row per recipient — idempotent batches and per-recipient tracking).

## Security

- Access JWT (15 min) + rotating refresh token (30 days, hashed in DB, reuse revokes all sessions), both httpOnly cookies.
- Social OAuth tokens encrypted with AES-256-GCM (`ENCRYPTION_KEY`).
- All tenant data access goes through workspace-scoped repositories or explicit `workspaceId` filters; roles are enforced per route.
- Webhooks verify signatures (Stripe, Standard Webhooks for Higgsfield) and are idempotent. Email links are signed tokens, so tracking and unsubscribe links can't be forged or used as open redirects.

## Known gaps / next steps

- Video posting to X (chunked upload) is not implemented.
- LinkedIn post analytics need LinkedIn's restricted Community Management API.
- Analytics aggregate in application code; at scale, move to a nightly rollup table.
- Bounce/complaint handling depends on the email provider's webhooks (not wired yet).
