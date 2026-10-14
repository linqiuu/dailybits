ARG BASE_IMAGE=node:22-bookworm-slim
FROM ${BASE_IMAGE}

WORKDIR /app

ARG APT_MIRROR=http://mirrors.tuna.tsinghua.edu.cn/debian
ARG APT_SECURITY_MIRROR=http://mirrors.tuna.tsinghua.edu.cn/debian-security
ARG NPM_REGISTRY=https://registry.npmmirror.com
ARG PRISMA_ENGINES_MIRROR=https://binaries.prisma.sh
ENV TZ=Asia/Shanghai
ENV NEXT_TELEMETRY_DISABLED=1

RUN set -eux; \
  find /etc/apt -type f \( -name '*.list' -o -name '*.sources' \) \
    -exec sed -i \
      -e "s|http://deb.debian.org/debian-security|${APT_SECURITY_MIRROR}|g" \
      -e "s|http://security.debian.org/debian-security|${APT_SECURITY_MIRROR}|g" \
      -e "s|http://deb.debian.org/debian|${APT_MIRROR}|g" \
      -e "s|https://deb.debian.org/debian-security|${APT_SECURITY_MIRROR}|g" \
      -e "s|https://security.debian.org/debian-security|${APT_SECURITY_MIRROR}|g" \
      -e "s|https://deb.debian.org/debian|${APT_MIRROR}|g" \
      {} +; \
  apt-get update; \
  apt-get install -y --no-install-recommends ca-certificates openssl; \
  rm -rf /var/lib/apt/lists/*

# Install dependencies first for better layer caching.
COPY package.json package-lock.json ./
RUN --mount=type=secret,id=npmrc \
    --mount=type=secret,id=company_ca \
    if [ -f /run/secrets/company_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/company_ca; fi; \
    if [ -f /run/secrets/npmrc ]; then export NPM_CONFIG_USERCONFIG=/run/secrets/npmrc; fi; \
    npm_config_registry="${NPM_REGISTRY}" PRISMA_ENGINES_MIRROR="${PRISMA_ENGINES_MIRROR}" npm ci --no-audit --no-fund

# Copy source code and build the app.
COPY . .
RUN --mount=type=secret,id=company_ca \
    if [ -f /run/secrets/company_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/company_ca; fi; \
    PRISMA_ENGINES_MIRROR="${PRISMA_ENGINES_MIRROR}" node node_modules/prisma/build/index.js generate
RUN --mount=type=secret,id=company_ca \
    if [ -f /run/secrets/company_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/company_ca; fi; \
    PRISMA_ENGINES_MIRROR="${PRISMA_ENGINES_MIRROR}" npm run build

EXPOSE 3000

# Default command runs web service. Scheduler uses docker-compose override.
CMD ["node", "scripts/container-start.mjs", "web"]
