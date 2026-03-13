# ── Stage 1: Compute dependency recipe ──────────────────────────────
FROM rust:1.94-slim AS chef
RUN cargo install cargo-chef --locked
WORKDIR /app

# ── Stage 2: Cache dependencies ────────────────────────────────────
FROM chef AS planner
COPY Cargo.toml Cargo.lock ./
COPY src/ src/
RUN cargo chef prepare --recipe-path recipe.json

# ── Stage 3: Build ─────────────────────────────────────────────────
FROM chef AS builder
COPY --from=planner /app/recipe.json recipe.json
# Build dependencies only (cached until Cargo.toml/Cargo.lock change)
RUN cargo chef cook --release --recipe-path recipe.json
# Build the application
COPY Cargo.toml Cargo.lock ./
COPY src/ src/
RUN cargo build --release --bin ats-proxy-server

# ── Stage 4: Minimal runtime ──────────────────────────────────────
FROM gcr.io/distroless/cc-debian12 AS runtime

COPY --from=builder /app/target/release/ats-proxy-server /usr/local/bin/
COPY config/ /config/

ENV APP__SERVER__HOST=0.0.0.0
ENV APP__SERVER__PORT=3333
EXPOSE 3333

ENTRYPOINT ["ats-proxy-server"]
