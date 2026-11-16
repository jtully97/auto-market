# Contributing

## Commit messages

We use [Conventional Commits](https://www.conventionalcommits.org). The commit type decides the next version and the changelog section, so it matters:

| Type                                               | Version bump | Changelog   |
| -------------------------------------------------- | ------------ | ----------- |
| `feat`                                             | minor        | Features    |
| `fix`                                              | patch        | Bug Fixes   |
| `perf`                                             | patch        | Performance |
| `refactor`, `docs`, `revert`                       | patch        | listed      |
| `chore`, `ci`, `build`, `test`, `style`            | none         | hidden      |
| `!` after the type, or a `BREAKING CHANGE:` footer | major        | highlighted |

Suggested scopes: `api`, `web`, `shared`, `worker`, `db`, `ai`, `billing`, `social`, `email`, `analytics`, `infra`, `ci`, `deps`.

```
feat(email): add A/B subject line testing
fix(social): retry Instagram containers that are still processing
```

A husky `commit-msg` hook runs commitlint locally, and CI checks every commit and the PR title. Squash-merge PRs so the PR title becomes the commit on `main`.

## Workflow

1. Branch from `main`, commit with conventional messages, open a PR.
2. CI runs commitlint, typecheck, lint, tests, builds and a Docker build.
3. Merge. release-please updates the release PR (`chore(release): x.y.z`) with the version bump and `CHANGELOG.md`.
4. Merging the release PR tags `vX.Y.Z` and deploys to staging, then production.

## Adding things

- **An API resource**: add a Prisma model, a `WorkspaceRepository` subclass, a service (extend `BaseCrudService` for CRUD), and routes with `defineRoutes`. Register the routes in `src/routes.ts`.
- **A social platform**: implement `OAuth2Provider` in `integrations/social`, register it in `registry.ts`, and add the platform to `PLATFORMS` / `PLATFORM_SPECS` in shared.
- **An AI action**: add it to `AI_ACTIONS` and `AI_ACTION_PRICING` in `shared/src/credits.ts` (the pricing test checks margins), then call it through `creditService.withReservation` or `reserve` / `capture` / `release`.
- **A background job**: add the payload type and retry policy in `core/queue/queue.ts`, and a handler in `jobs/handlers.ts` that calls a service.
- **Database changes**: `pnpm db:migrate --name <change>` and commit the migration.
