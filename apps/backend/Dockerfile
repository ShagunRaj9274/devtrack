# syntax=docker/dockerfile:1
# DevTrack API: NestJS + Prisma. Multi-stage: build with dev deps, ship only runtime deps.

FROM node:22-slim AS base
# openssl: required by Prisma's schema engine (used by `prisma migrate deploy` at startup)
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS build
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npx prisma generate \
  && npm run build \
  && npm run build:seed \
  && npm prune --omit=dev \
  # Regenerate after pruning so the generated client is guaranteed to be present.
  && npx prisma generate

FROM base AS runtime
ENV NODE_ENV=production \
    PORT=4000
COPY --from=build --chown=node:node /app/package.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/dist-seed ./dist-seed
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --chown=node:node docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh
USER node
EXPOSE 4000
HEALTHCHECK --interval=10s --timeout=3s --start-period=40s --retries=6 \
  CMD node -e "fetch('http://127.0.0.1:4000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["./docker-entrypoint.sh"]
