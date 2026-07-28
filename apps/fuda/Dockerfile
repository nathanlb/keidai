# syntax=docker/dockerfile:1

FROM node:24-alpine AS build

RUN corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json turbo.json ./
COPY packages/shared packages/shared
COPY apps/fuda apps/fuda

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @keidai/shared build
RUN pnpm --filter @keidai/fuda build
RUN pnpm --filter @keidai/fuda deploy --prod --legacy /out

FROM node:24-alpine AS runtime

WORKDIR /app

RUN addgroup -g 1001 fuda \
  && adduser -u 1001 -G fuda -D fuda \
  && mkdir -p /app/data \
  && chown -R fuda:fuda /app

ENV NODE_ENV=production \
    FUDA_DB_PATH=/app/data/fuda.db \
    FUDA_HOST=0.0.0.0 \
    FUDA_PORT=3300

COPY --from=build --chown=fuda:fuda /out/dist ./dist
COPY --from=build --chown=fuda:fuda /out/node_modules ./node_modules
COPY --from=build --chown=fuda:fuda /out/package.json ./package.json

USER fuda

EXPOSE 3300

CMD ["node", "dist/index.js"]
