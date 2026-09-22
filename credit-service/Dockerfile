FROM node:24.11-alpine AS build

RUN npm install --global pnpm@12.5.1
WORKDIR /workspace

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY credit-service/package.json credit-service/package.json
RUN pnpm install --frozen-lockfile --filter @foc/credit-service...

COPY credit-service credit-service
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build \
    pnpm --filter @foc/credit-service build \
    && pnpm --filter @foc/credit-service deploy --prod /app

FROM node:24.11-alpine AS runtime

ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /app ./
COPY --from=build /workspace/credit-service/docker-entrypoint.sh /usr/local/bin/credit-entrypoint
RUN chmod 755 /usr/local/bin/credit-entrypoint

USER node
EXPOSE 3003
ENTRYPOINT ["credit-entrypoint"]
CMD ["node", "dist/main.js"]
