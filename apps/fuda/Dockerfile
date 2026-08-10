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
RUN pnpm --filter @keidai/fuda deploy --prod --legacy /out \
  && rm -rf /out/node_modules/@keidai/shared \
  && pnpm --filter @keidai/shared deploy --prod --legacy /out/node_modules/@keidai/shared \
  && rm -rf /out/node_modules/@keidai/shared/src /out/node_modules/@keidai/shared/.turbo /out/node_modules/@keidai/shared/tsconfig.json

FROM node:24-alpine AS runtime

WORKDIR /app

RUN addgroup -g 1001 fuda \
  && adduser -u 1001 -G fuda -D fuda \
  && mkdir -p /app/data /app/keys \
  && chown -R fuda:fuda /app

ENV NODE_ENV=production \
    FUDA_HOST=0.0.0.0 \
    FUDA_PORT=3300 \
    FUDA_DB_PATH=/app/data/fuda.db \
    FUDA_LISTEN_GROUPS=public,agent,management

COPY --from=build --chown=fuda:fuda /out/dist ./dist
COPY --from=build --chown=fuda:fuda /out/node_modules ./node_modules
COPY --from=build --chown=fuda:fuda /out/package.json ./package.json

USER fuda

EXPOSE 3300

VOLUME ["/app/data"]

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.FUDA_PORT || 3300) + '/api/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "dist/index.js"]
