# AutoMarket

Put your marketing on autopilot. One place to schedule social posts everywhere, generate on-brand content with AI (opt-in), study what works, and run email campaigns.

|                 |                                                                                                                                |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **Social**      | Instagram, Facebook, TikTok, YouTube, LinkedIn, X — composer, calendar, queue with posting slots, approvals                    |
| **AI (opt-in)** | Captions, hashtags, repurposing, weekly content plans, email drafts (OpenAI); images (OpenAI / Higgsfield); video (Higgsfield) |
| **AI analyst**  | Researches the brand's niche (web search) and its own performance; the findings feed every later generation                    |
| **Autopilot**   | Weekly AI-drafted posts land in the approval queue; nothing publishes without a human OK                                       |
| **Analytics**   | Engagement by platform, format and time slot; top posts; follower growth                                                       |
| **Email**       | CSV import with column mapping, lists, AI-written campaigns, scheduling, open/click tracking, one-click unsubscribe            |
| **Billing**     | Stripe subscriptions + credit packs (hybrid model — see [docs/PRICING.md](docs/PRICING.md))                                    |

## Stack

- **apps/api** — Node 22, TypeScript, Express 5, MVC with shared base classes, Prisma 7 + PostgreSQL, pg-boss job queue (Postgres-backed)
- **apps/web** — Next.js 16 (App Router), shadcn/ui (Radix), Tailwind 4, TanStack Query
- **packages/shared** — plans, credit pricing, platform rules and zod schemas shared by both apps
- **infra/terraform** — Google Cloud: Cloud Run, Cloud SQL, Cloud Storage, Secret Manager, Artifact Registry, Workload Identity Federation
- **CI/CD** — GitHub Actions, commitlint, release-please (semver + CHANGELOG from conventional commits)

Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how the pieces fit together.

## Quick start

Requires Node ≥ 20.19, pnpm 10, Docker.

```bash
pnpm install
cp .env.example .env            # then set JWT_SECRET / ENCRYPTION_KEY (see comments)
docker compose up -d db mailpit # Postgres on :5434, Mailpit UI on :8025
pnpm db:migrate && pnpm db:seed # demo@automarket.local / demo-password-123
pnpm --filter @automarket/shared build
pnpm dev                        # web :3000, api :4000
pnpm --filter @automarket/api dev:worker   # background jobs (publishing, email, metrics)
```

Or run everything in containers: `docker compose up --build`.

AI, Stripe and social features need their keys in `.env`; without them the app runs and those actions return a clear "not configured" error (credits are never charged for a failed call).

## Scripts

| Command                                      | What it does                                        |
| -------------------------------------------- | --------------------------------------------------- |
| `pnpm dev`                                   | API + web with hot reload                           |
| `pnpm typecheck` / `pnpm lint` / `pnpm test` | Checks across all packages                          |
| `pnpm db:migrate`                            | Create/apply Prisma migrations (dev)                |
| `pnpm --filter @automarket/api stripe:sync`  | Create Stripe products/prices from the plan catalog |

## Commits and releases

Commits must follow [Conventional Commits](https://www.conventionalcommits.org) — enforced by a husky hook and in CI.

```
feat(social): add Threads publishing      → minor release
fix(billing): grant credits on renewal    → patch release
feat(api)!: drop v0 webhook payloads      → major release
```

On every push to `main`, release-please updates a release PR with the next version and `CHANGELOG.md`. Merging it tags the release, builds versioned images, runs migrations, and deploys to staging and then production (production gated by a GitHub Environment approval). See [CONTRIBUTING.md](CONTRIBUTING.md).

## Going live checklist

1. `terraform apply` for each environment (see `infra/terraform`), then add secret values in Secret Manager.
2. Set GitHub Environment variables from the Terraform outputs (`GCP_WIF_PROVIDER`, `GCP_DEPLOY_SA`, `NAME_PREFIX`, …).
3. Run `stripe:sync`; point a Stripe webhook at `{API_URL}/v1/billing/webhook` (events: `checkout.session.completed`, `customer.subscription.*`, `invoice.paid`).
4. Point the Higgsfield webhook at `{API_URL}/v1/webhooks/higgsfield`.
5. Register developer apps with Meta, TikTok, Google (YouTube), LinkedIn and X; redirect URI `{API_URL}/v1/social-accounts/callback/{platform}`. **Meta, TikTok and Google review apps before they can publish for other users — start early.**
6. Configure an email provider (SMTP), with SPF/DKIM/DMARC on the sending domain.
