# syntax=docker/dockerfile:1

FROM node:24-alpine AS build

RUN corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json turbo.json torii.example.yaml ./
COPY packages/shared packages/shared
COPY packages/ui packages/ui
COPY apps/gateway apps/gateway
COPY apps/keidai-ui apps/keidai-ui

RUN pnpm install --frozen-lockfile

# UI is served from Torii — API calls use same-origin /api paths.
RUN pnpm --filter @keidai/keidai-ui build
RUN pnpm --filter @keidai/gateway build
RUN pnpm --filter @keidai/gateway deploy --prod --legacy /out

FROM node:24-alpine AS runtime

WORKDIR /app

RUN addgroup -g 1001 torii \
  && adduser -u 1001 -G torii -D torii \
  && mkdir -p /app/data \
  && chown -R torii:torii /app

ENV NODE_ENV=production \
    TORII_HOST=0.0.0.0 \
    TORII_PORT=3100 \
    TORII_UI_CLIENT_ROOT=/app/ui \
    TORII_CONFIG_PATH=/app/torii.yaml \
    TORII_DB_PATH=/app/data/torii.db

COPY --from=build --chown=torii:torii /out/dist ./dist
COPY --from=build --chown=torii:torii /out/node_modules ./node_modules
COPY --from=build --chown=torii:torii /out/package.json ./package.json
COPY --from=build --chown=torii:torii /app/apps/keidai-ui/dist/client /app/ui
COPY --from=build --chown=torii:torii /app/torii.example.yaml /app/torii.yaml

USER torii

EXPOSE 3100

VOLUME ["/app/data"]

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.TORII_PORT || 3100) + '/api/config/servers').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "dist/index.js"]
