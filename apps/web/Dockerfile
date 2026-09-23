FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY apps/web/package*.json apps/web/
RUN npm --prefix apps/web ci
COPY apps/web apps/web
COPY apps/dashboard apps/dashboard
RUN npm --prefix apps/web run build

FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends python3 ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /app/apps/web/dist apps/web/dist
COPY --from=build /app/apps/web/node_modules apps/web/node_modules
COPY apps/web/server apps/web/server
COPY apps/web/package.json apps/web/package.json
COPY scripts scripts
COPY config config
ENV NODE_ENV=production
USER node
CMD ["node", "apps/web/server/production.mjs"]
