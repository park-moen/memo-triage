FROM node:24-bookworm-slim

# Prisma 엔진이 openssl을 쓴다. nest start --watch는 재시작할 때 ps로 이전 프로세스를 찾아 종료한다(procps).
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl procps \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npx prisma generate

EXPOSE 3000
CMD ["sh", "-c", "npx prisma migrate deploy && npm run start:dev"]
