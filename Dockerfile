FROM node:22-bookworm-slim

# Install system dependencies
RUN apt-get update && \
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    git \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* /var/cache/apt/archives/*

# Install Bun (required for build scripts)
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:${PATH}"

# Enable corepack for pnpm
RUN corepack enable

WORKDIR /app
RUN chown node:node /app

# Optional: install extra system packages at build time
ARG OPENCLAW_DOCKER_APT_PACKAGES=""
RUN if [ -n "$OPENCLAW_DOCKER_APT_PACKAGES" ]; then \
    apt-get update && \
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends $OPENCLAW_DOCKER_APT_PACKAGES && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/* /var/cache/apt/archives/*; \
    fi

# Clone OpenClaw source
ARG OPENCLAW_VERSION=main
RUN git clone --depth 1 --branch ${OPENCLAW_VERSION} https://github.com/openclaw/openclaw.git /app && \
    chown -R node:node /app

# Install dependencies as non-root user
USER node
RUN NODE_OPTIONS=--max-old-space-size=2048 pnpm install --frozen-lockfile

# Optional: install Chromium for browser automation
USER root
ARG OPENCLAW_INSTALL_BROWSER=""
RUN if [ -n "$OPENCLAW_INSTALL_BROWSER" ]; then \
    apt-get update && \
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends xvfb && \
    mkdir -p /home/node/.cache/ms-playwright && \
    PLAYWRIGHT_BROWSERS_PATH=/home/node/.cache/ms-playwright \
    node /app/node_modules/playwright-core/cli.js install --with-deps chromium && \
    chown -R node:node /home/node/.cache/ms-playwright && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/* /var/cache/apt/archives/*; \
    fi

# Build the project
USER node
RUN pnpm build && pnpm ui:build

ENV NODE_ENV=production
ENV OPENCLAW_PREFER_PNPM=1

# Expose gateway and bridge ports
EXPOSE 18789 18790

# Run as non-root
USER node

CMD ["node", "dist/index.js", "gateway", "--allow-unconfigured"]
