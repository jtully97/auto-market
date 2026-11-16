# syntax=docker/dockerfile:1.7
# One image, two roles: the HTTP API (default CMD) and the background worker
# (`node dist/worker.js`). The `migrate` target runs `prisma migrate deploy`.
# Build from the repo root:  docker build -f apps/api/Dockerfile .

ARG NODE_VERSION=22-alpine

FROM node:${NODE_VERSION} AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=1
RUN corepack enable
WORKDIR /repo

FROM base AS builder
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc* ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/api/prisma apps/api/prisma
COPY apps/api/prisma.config.ts apps/api/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --filter @automarket/api... --ignore-scripts
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @automarket/api db:generate \
 && pnpm --filter @automarket/shared build \
 && pnpm --filter @automarket/api build \
 && pnpm --filter @automarket/api deploy --prod --legacy --ignore-scripts /out

# ── Migrations (Cloud Run Job / compose one-shot) ──
FROM builder AS migrate
WORKDIR /repo/apps/api
CMD ["pnpm", "exec", "prisma", "migrate", "deploy"]

# ── Runtime ──
FROM node:${NODE_VERSION} AS runtime
ENV NODE_ENV=production PORT=8080
WORKDIR /app
RUN addgroup -S app && adduser -S app -G app
COPY --from=builder --chown=app:app /out/node_modules ./node_modules
COPY --from=builder --chown=app:app /out/package.json ./package.json
COPY --from=builder --chown=app:app /repo/apps/api/dist ./dist
USER app
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:${PORT}/healthz || exit 1
CMD ["node", "dist/server.js"]
