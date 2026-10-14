FROM node:24.11-alpine AS build

RUN npm install --global pnpm@12.11.2
WORKDIR /workspace

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY web-app/package.json web-app/package.json
RUN pnpm install --frozen-lockfile --filter @foc/web-app...

COPY web-app web-app
RUN pnpm --filter @foc/web-app build \
    && pnpm --filter @foc/web-app deploy --prod /app

FROM node:24.11-alpine AS runtime

ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /app ./

USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --retries=5 \
  CMD wget --spider --quiet http://127.0.0.1:3000/login || exit 1
CMD ["node", "node_modules/next/dist/bin/next", "start", "--hostname", "0.0.0.0", "--port", "3000"]
