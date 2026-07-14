# syntax=docker/dockerfile:1

FROM node:24-alpine AS build

RUN corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json turbo.json ./
COPY packages/shared packages/shared
COPY apps/shaiden apps/shaiden

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @keidai/shared build
RUN pnpm --filter @keidai/shaiden build
RUN pnpm --filter @keidai/shaiden deploy --prod --legacy /out

FROM node:24-alpine AS runtime

WORKDIR /app

RUN addgroup -g 1001 shaiden \
  && adduser -u 1001 -G shaiden -D shaiden \
  && mkdir -p /app/data \
  && chown -R shaiden:shaiden /app

ENV NODE_ENV=production \
    TORII_MCP_URL=http://torii:3100/mcp \
    SHAIDEN_DB_PATH=/app/data/shaiden.db

COPY --from=build --chown=shaiden:shaiden /out/dist ./dist
COPY --from=build --chown=shaiden:shaiden /out/node_modules ./node_modules
COPY --from=build --chown=shaiden:shaiden /out/package.json ./package.json

USER shaiden

CMD ["node", "dist/index.js"]
