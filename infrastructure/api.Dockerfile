FROM node:24-bookworm-slim AS dependencies
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/game-core/package.json packages/game-core/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/api/package.json apps/api/package.json
RUN pnpm install --prod --frozen-lockfile --store-dir /tmp/pnpm-store && rm -rf /tmp/pnpm-store
FROM dependencies
ARG BUILD_VERSION=local
LABEL org.opencontainers.image.source=https://github.com/allen141/undercut \
      org.opencontainers.image.revision=$BUILD_VERSION
ENV NODE_ENV=production PORT=3001 BUILD_VERSION=$BUILD_VERSION
COPY packages packages
COPY apps/api apps/api
USER node
EXPOSE 3001
HEALTHCHECK --interval=10s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:3001/api/v1/health/ready').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node","--import","tsx","apps/api/src/server.ts"]
