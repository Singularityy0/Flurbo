FROM rust:1.97.1-bookworm AS learning-build
WORKDIR /app
COPY Cargo.toml Cargo.lock ./
COPY crates/flurbo-core crates/flurbo-core
RUN cargo build --offline --locked --release -p flurbo-core --example parlay_compare
RUN cargo test --offline --locked -p flurbo-core --example parlay_testnet_model && cargo build --offline --locked --release -p flurbo-core --example parlay_testnet_model

FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY apps/web/package*.json apps/web/
RUN npm --prefix apps/web ci
COPY apps/web apps/web
COPY apps/dashboard apps/dashboard
COPY config/learning-testnet.json config/learning-testnet.json
COPY --from=learning-build /app/target/release/examples/parlay_compare bin/flurbo-parlay-compare
COPY --from=learning-build /app/target/release/examples/parlay_testnet_model bin/flurbo-learning-model
RUN node --input-type=module -e "import {runComparison} from './apps/web/server/learning-comparison.mjs'; await runComparison();"
RUN node --input-type=module -e "import {loadLearningModel} from './apps/web/server/learning-pool.mjs'; await loadLearningModel();"
RUN npm --prefix apps/web run build

FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends python3 ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /app/apps/web/dist apps/web/dist
COPY --from=build /app/apps/web/node_modules apps/web/node_modules
COPY --from=build /app/bin/flurbo-parlay-compare bin/flurbo-parlay-compare
COPY --from=build /app/bin/flurbo-learning-model bin/flurbo-learning-model
COPY apps/web/server apps/web/server
COPY apps/web/shared apps/web/shared
COPY apps/web/package.json apps/web/package.json
COPY scripts scripts
COPY config config
ENV NODE_ENV=production
USER node
CMD ["node", "apps/web/server/production.mjs"]
