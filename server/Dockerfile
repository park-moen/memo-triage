FROM node:24-bookworm-slim

# Prisma 엔진이 openssl을 쓴다. nest start --watch는 재시작할 때 ps로 이전 프로세스를 찾아 종료한다(procps).
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl procps \
  && rm -rf /var/lib/apt/lists/*

# 루트 package.json의 packageManager에 적힌 pnpm 버전을 corepack이 받아 쓴다.
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/
COPY server/package.json server/
COPY web/package.json web/
RUN pnpm install --frozen-lockfile --filter server...

COPY packages/shared packages/shared
COPY server server
RUN pnpm -F @memo/shared build && pnpm -F server exec prisma generate

WORKDIR /app/server
EXPOSE 3000
CMD ["sh", "-c", "pnpm exec prisma migrate deploy && pnpm run start:dev"]
