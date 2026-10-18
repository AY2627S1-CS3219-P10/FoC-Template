FROM node:24.11-alpine AS build
RUN npm install --global pnpm@12.11.2
WORKDIR /workspace
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY order-service/package.json order-service/package.json
RUN pnpm install --frozen-lockfile --filter @foc/order-service...
COPY order-service order-service
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build pnpm --filter @foc/order-service build \
    && pnpm --filter @foc/order-service deploy --prod /app
FROM node:24.11-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build --chown=node:node /app ./
COPY --chmod=755 order-service/docker-entrypoint.sh /usr/local/bin/order-entrypoint
USER node
EXPOSE 3004
ENTRYPOINT ["order-entrypoint"]
CMD ["node", "dist/main.js"]
