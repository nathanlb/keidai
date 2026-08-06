# syntax=docker/dockerfile:1

FROM node:24-alpine AS build

RUN corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json turbo.json ./
COPY packages/shared packages/shared
COPY packages/ui packages/ui
COPY apps/keidai-ui apps/keidai-ui

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @keidai/shared build
RUN pnpm --filter @keidai/ui build
RUN pnpm --filter @keidai/keidai-ui build
RUN pnpm --filter @keidai/keidai-ui deploy --prod --legacy /out \
  && rm -rf /out/node_modules/@keidai/shared \
  && pnpm --filter @keidai/shared deploy --prod --legacy /out/node_modules/@keidai/shared \
  && rm -rf /out/node_modules/@keidai/shared/src /out/node_modules/@keidai/shared/.turbo /out/node_modules/@keidai/shared/tsconfig.json

FROM node:24-alpine AS runtime

WORKDIR /app

RUN addgroup -g 1001 keidaiui \
  && adduser -u 1001 -G keidaiui -D keidaiui \
  && chown -R keidaiui:keidaiui /app

ENV NODE_ENV=production \
    KEIDAI_UI_HOST=0.0.0.0 \
    KEIDAI_UI_PORT=3000

COPY --from=build --chown=keidaiui:keidaiui /out/dist ./dist
COPY --from=build --chown=keidaiui:keidaiui /out/node_modules ./node_modules
COPY --from=build --chown=keidaiui:keidaiui /out/package.json ./package.json
COPY --from=build --chown=keidaiui:keidaiui /app/apps/keidai-ui/dist/client ./dist/client

USER keidaiui

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.KEIDAI_UI_PORT || 3000) + '/').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "dist/server/index.js"]
