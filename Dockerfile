FROM node:22-bookworm-slim

WORKDIR /app

ARG APT_MIRROR=http://mirrors.tuna.tsinghua.edu.cn/debian
ARG APT_SECURITY_MIRROR=http://mirrors.tuna.tsinghua.edu.cn/debian-security
ARG NPM_REGISTRY=https://registry.npmmirror.com
ENV npm_config_registry=${NPM_REGISTRY}
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
RUN npm ci

# Copy source code and build the app.
COPY . .
RUN npx prisma generate
RUN npm run build

EXPOSE 3000

# Default command runs web service. Scheduler uses docker-compose override.
CMD ["node", "scripts/container-start.mjs", "web"]
