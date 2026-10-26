# syntax=docker/dockerfile:1
# Build this image away from the client's production VPS.
FROM node:24.19.0-alpine@sha256:d32cdf619f63fe0471182d08996dd516c6275bb5fd31ae06e55a570bd9e1ad43 AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=secret,id=egress_proxy --mount=type=secret,id=egress_ca \
    if [ -s /run/secrets/egress_proxy ]; then \
      export HTTPS_PROXY="$(cat /run/secrets/egress_proxy)"; \
      export HTTP_PROXY="$HTTPS_PROXY"; \
    fi; \
    if [ -s /run/secrets/egress_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/egress_ca; fi; \
    npm ci --fetch-retries=1 --fetch-timeout=45000 --no-audit --no-fund
COPY tsconfig.json vite.config.ts index.html ./
COPY src ./src
COPY shared ./shared
COPY server ./server
COPY scripts ./scripts
COPY tests ./tests
COPY public ./public
COPY data/snapshot.json ./data/snapshot.json
RUN npm run build && npm test && npm prune --omit=dev --no-audit --no-fund

FROM node:24.19.0-alpine@sha256:d32cdf619f63fe0471182d08996dd516c6275bb5fd31ae06e55a570bd9e1ad43 AS runtime
ENV NODE_ENV=production PORT=3000 NODE_OPTIONS=--max-old-space-size=192
WORKDIR /app
COPY --from=build --chown=node:node /app/package.json /app/package-lock.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/server ./server
COPY --from=build --chown=node:node /app/shared ./shared
COPY --from=build --chown=node:node /app/data/snapshot.json ./data/snapshot.json
RUN mkdir -p /app/data/runtime && chown node:node /app/data/runtime
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>{if(!r.ok)process.exit(1);return r.json()}).then(d=>{if(d.status!=='ok')process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "--import", "tsx", "server/index.ts"]
