# 메모 분류함

업무 중 떠오른 메모를 `할 일·아이디어·확인할 것·참고` 4칸 중 하나로 분류하는 사이드 프로젝트입니다. 2단계에서 Cloudflare Workers AI의 Clef-flash가 분류를 맡습니다. 지금(1단계)은 키워드 규칙 분류기로 동작합니다.

설계: `docs/superpowers/specs/2026-10-04-memo-classifier-design.md`

## 실행

필요한 것: Docker, Node.js, pnpm 12 (`packageManager`에 버전 고정)

```bash
pnpm install
pnpm build:shared            # @memo/shared를 먼저 build해야 server·web이 import할 수 있습니다
docker compose up -d         # Postgres(5433) + server(3000)
pnpm dev:web                 # http://localhost:5173
```

## 테스트

```bash
docker compose up -d db
cp server/.env.example server/.env   # 처음 한 번
pnpm build:shared
pnpm -F server exec prisma generate   # Prisma client 생성 (pnpm install 뒤 한 번)
pnpm test                    # shared schema + server 단위 테스트
pnpm -F server test:e2e:prepare      # 테스트 DB(memo_test)에 migration 적용
pnpm test:e2e                # API 테스트
```

## 바꿨을 때 다시 띄우기

| 바꾼 것 | 할 일 |
| --- | --- |
| `server/src` | 자동 반영 |
| `packages/shared` | web: `pnpm dev:shared`를 켜 두면 자동 반영 / server: `docker compose up -d --build server` |
| `server/prisma/schema.prisma` | `pnpm -F server exec prisma migrate dev --name <변경-이름>` 후 `docker compose up -d --build server` |
| `package.json`(의존성) | `pnpm install`과 `pnpm -F server exec prisma generate` 후 `docker compose up -d --build server` |
