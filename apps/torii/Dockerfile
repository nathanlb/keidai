# syntax=docker/dockerfile:1

FROM node:24-alpine AS build

RUN corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json turbo.json torii.example.yaml ./
COPY packages/shared packages/shared
COPY packages/postgres packages/postgres
COPY apps/torii apps/torii

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @keidai/shared build
RUN pnpm --filter @keidai/postgres build
RUN pnpm --filter @keidai/torii build
RUN pnpm --filter @keidai/torii deploy --prod --legacy /out \
  && rm -rf /out/node_modules/@keidai/shared \
  && pnpm --filter @keidai/shared deploy --prod --legacy /out/node_modules/@keidai/shared \
  && rm -rf /out/node_modules/@keidai/shared/src /out/node_modules/@keidai/shared/.turbo /out/node_modules/@keidai/shared/tsconfig.json \
  && rm -rf /out/node_modules/@keidai/postgres \
  && pnpm --filter @keidai/postgres deploy --prod --legacy /out/node_modules/@keidai/postgres \
  && rm -rf /out/node_modules/@keidai/postgres/src /out/node_modules/@keidai/postgres/.turbo /out/node_modules/@keidai/postgres/tsconfig.json

FROM node:24-alpine AS runtime

WORKDIR /app

RUN addgroup -g 1001 torii \
  && adduser -u 1001 -G torii -D torii \
  && chown -R torii:torii /app

ENV NODE_ENV=production \
    TORII_HOST=0.0.0.0 \
    TORII_PORT=3100 \
    TORII_CONFIG_PATH=/app/torii.yaml

COPY --from=build --chown=torii:torii /out/dist ./dist
COPY --from=build --chown=torii:torii /out/node_modules ./node_modules
COPY --from=build --chown=torii:torii /out/package.json ./package.json
COPY --from=build --chown=torii:torii /app/torii.example.yaml /app/torii.yaml

USER torii

EXPOSE 3100

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.TORII_PORT || 3100) + '/api/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "dist/index.js"]
