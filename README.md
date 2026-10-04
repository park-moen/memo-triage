# 메모 분류함

업무 중 떠오른 메모를 `할 일·아이디어·확인할 것·참고` 4칸 중 하나로 분류하는 사이드 프로젝트입니다. 2단계에서 Cloudflare Workers AI의 Clef-flash가 분류를 맡습니다. 지금(1단계)은 키워드 규칙 분류기로 동작합니다.

설계: `docs/superpowers/specs/2026-10-04-memo-classifier-design.md`

## 실행

필요한 것: Docker, Node.js

```bash
docker compose up -d          # Postgres(5433) + server(3000)
cd web && npm install && npm run dev   # http://localhost:5173
```

## 테스트

```bash
docker compose up -d db
cd server && npm install
npm test                      # 단위 테스트
npm run test:e2e:prepare      # 테스트 DB(memo_test)에 migration 적용
npm run test:e2e              # API 테스트
```

## schema를 바꿨을 때

```bash
cd server && npx prisma migrate dev --name <변경-이름>
docker compose up -d --build server
```
