# syntax=docker/dockerfile:1
# Build from the REPOSITORY ROOT (monorepo): docker build -f apps/nl-analytics/Dockerfile -t tally .

FROM node:22-bookworm-slim AS deps
WORKDIR /repo
# npm workspaces: every workspace manifest must be present for `npm ci` to match the lockfile,
# so the whole (dockerignored) source tree is copied. Simpler than per-file COPY; slightly less cache reuse.
COPY . .
RUN npm ci --include-workspace-root

# Builder: also used by docker-compose to run migrations and the seed script.
FROM node:22-bookworm-slim AS builder
WORKDIR /repo
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /repo ./
RUN BUILD_STANDALONE=1 npm run build --workspace apps/nl-analytics

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN groupadd --system --gid 1001 app && useradd --system --uid 1001 --gid app app
COPY --from=builder --chown=app:app /repo/apps/nl-analytics/.next/standalone ./
COPY --from=builder --chown=app:app /repo/apps/nl-analytics/.next/static ./apps/nl-analytics/.next/static
COPY --from=builder --chown=app:app /repo/apps/nl-analytics/public ./apps/nl-analytics/public
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://localhost:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/nl-analytics/server.js"]
