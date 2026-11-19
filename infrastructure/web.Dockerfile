FROM node:24-bookworm-slim AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/game-core/package.json packages/game-core/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/api/package.json apps/api/package.json
RUN pnpm install --frozen-lockfile --store-dir /tmp/pnpm-store && rm -rf /tmp/pnpm-store
COPY tsconfig.json ./
COPY packages packages
COPY apps/web apps/web
RUN pnpm build
FROM nginxinc/nginx-unprivileged:1.28-alpine
ARG BUILD_VERSION=local
LABEL org.opencontainers.image.source=https://github.com/allen141/undercut \
      org.opencontainers.image.revision=$BUILD_VERSION
COPY infrastructure/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=5s --start-period=10s CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1
