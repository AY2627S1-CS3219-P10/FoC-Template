# check=skip=InvalidDefaultArgInFrom
# AI Assistance Disclosure:
# Tool: GPT-6.1 Sol.
# Scope: AI-assisted implementation of migration helper image build commands.
# Author review: Checked migration image COPY paths, dependency commands, and entry-point arguments; edited Dockerfile instruction layout.


# One-off migration and seed image for user-service and supplier-service.
#
# Their runtime images prune the prisma CLI (a devDependency) and do not migrate
# at startup, so the deployment runs this image as a task before rolling them
# out. order-service and credit-service migrate in their own entrypoints.
#
# Build from the repository root (the supplier seed reads ../../data/csv):
#   docker build -f infra/docker/migrate.Dockerfile --build-arg SERVICE=user-service .
#   docker build -f infra/docker/migrate.Dockerfile --build-arg SERVICE=supplier-service .
# SERVICE has no default on purpose and selects the final stage below, so any
# other value fails with "pull access denied" for an image of that name.
#
# Run with DATABASE_URL set. The default command applies pending migrations.
# Supplier CSV seed (idempotent): override the command with
#   node scripts/seed-csv-locations.mjs
# The administrator seed runs from the user-service runtime image instead
# (node dist/seed-administrators.js).

ARG SERVICE

FROM node:24-alpine AS base
ARG SERVICE

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable

# Each service is a standalone pnpm project with its own lockfile. Keep
# devDependencies: the prisma CLI is one.
WORKDIR /repo/$SERVICE
COPY $SERVICE/package.json $SERVICE/pnpm-lock.yaml $SERVICE/pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY $SERVICE/prisma.config.ts ./
COPY $SERVICE/prisma ./prisma

FROM base AS user-service

FROM base AS supplier-service
COPY supplier-service/scripts ./scripts
COPY data/csv /repo/data/csv

FROM ${SERVICE}
ENV NODE_ENV=production
USER node
CMD ["node", "node_modules/prisma/build/index.js", "migrate", "deploy"]
