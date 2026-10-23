# Resource Board API. Build from the repo root:
#   docker build -f deploy/api.Dockerfile -t resource-board-api .
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/prisma.config.ts apps/api/
COPY apps/api/prisma apps/api/prisma
COPY apps/web/package.json apps/web/
# Full install: postinstall generates the Prisma client and fetches the migration engine.
RUN npm ci
COPY apps/api apps/api
RUN npm run build -w @rb/api

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=4100
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/apps/api apps/api
EXPOSE 4100
# Apply pending migrations, then start. Seed once with:
#   docker compose run --rm -e NODE_ENV=development api npm run db:seed -w @rb/api
CMD ["sh", "-c", "npm run db:deploy -w @rb/api && node apps/api/dist/server.js"]
