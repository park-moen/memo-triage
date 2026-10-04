# 메모 분류함 1단계 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 규칙 분류기만으로 메모 입력 → 칸 배치 → 칸 이동 → 적중 횟수 표시까지 로컬에서 끝까지 동작하는 메모 분류함을 만든다.

**Architecture:** `web/`(React + Vite, Docker 밖)가 Vite proxy로 `/api`를 `server/`(NestJS, Docker)에 넘기고, server는 Prisma로 `db`(Postgres, Docker)에 저장한다. 분류기는 `CLASSIFIER` 주입 토큰 뒤에 숨겨 두어, 2단계에서 Clef-flash 분류기로 바꿔 끼울 수 있게 한다.

**Tech Stack:** NestJS 11 (`@nestjs/cli@11.0.24`), Prisma 6.19.3, PostgreSQL 17, Jest + supertest(Nest 기본), React + TypeScript + Vite (`create-vite@9.2.1`), Docker Compose

**Spec:** `docs/superpowers/specs/2026-10-04-memo-classifier-design.md`

## Global Constraints

- 1단계에는 외부 계정, API 토큰, 모델 호출, 원격 Git 작업(push 등), 배포가 없다.
- 버전 고정: `@nestjs/cli@11.0.24`, `prisma@6.19.3`, `@prisma/client@6.19.3`, `create-vite@9.2.1`, `postgres:17`, server 컨테이너 `node:24-bookworm-slim`. 최신 major(NestJS 12, Prisma 7·8-rc, TypeScript 7)는 2026-08 이후에 나와서 이 계획의 코드를 검증하지 못했다.
- 메모는 앞뒤 공백을 지운 뒤 1자 이상, 200자 이하. 글자 수는 code point 기준(`[...str].length`)으로 센다. Postgres `VARCHAR(200)`도 같은 기준이다.
- 칸 코드와 화면 문구: `todo`=`할 일`, `idea`=`아이디어`, `check`=`확인할 것`, `reference`=`참고`. API·DB에는 코드만, 화면에는 문구만 쓴다.
- 분류 출처 값: `rule`, `clef-flash`. 1단계에서 저장되는 값은 `rule`뿐이다.
- 모든 API는 `/api` 접두어를 쓴다. 오류 응답의 `message`는 화면에 그대로 보여줄 한국어 문장이다.
- Postgres는 호스트 포트 `5433`에 연다(호스트에 이미 설치된 Postgres의 5432와 충돌하지 않게). 개발 DB는 `memo`, 테스트 DB는 `memo_test`, 계정은 `memo`/`memo`다.
- `.env`는 Git에 넣지 않는다. `.env.example`만 commit한다.
- commit은 local에서만 하고 `dev-workflow:commit` skill로 만든다. 제목은 동작 명사로 끝낸다(예: `규칙 분류기 추가`).

## Review Focus

1. 한글·이모지가 섞인 200자 경계: 200자는 저장되고 201자는 400이어야 한다. 이모지 200개도 앱과 DB가 같은 글자 수로 세야 한다 → Task 4·5 테스트.
2. 공백만 있는 메모와 앞뒤 공백: 공백만 있으면 400, 앞뒤 공백은 지우고 저장 → Task 4·5 테스트, 화면에서는 분류 버튼 비활성화(Task 8).
3. 칸을 옮겼다가 원래 칸으로 되돌림: 적중으로 다시 세야 한다(적중은 현재 상태로 계산) → Task 4·5 테스트.
4. server가 꺼진 상태에서 분류: 오류 문구가 보이고 입력한 메모가 입력창에 남아야 한다 → Task 8·9 수동 확인.
5. 존재하지 않는 id나 잘못된 칸으로 `PATCH`: 500이 아니라 404·400 → Task 5 테스트.

---

### Task 0: Git 작업 준비

> 사용자가 commit 방식을 정한 뒤 실행한다. 아래는 "`main`에 문서 첫 commit → 작업 branch에서 구현"을 가정한 절차다. 사용자 결정이 다르면 이 Task만 그에 맞춰 바꾼다.

**Files:** 없음 (Git 상태만 바꾼다)

- [ ] **Step 1: 현재 상태 확인**

Run: `git status --short && git remote -v`
Expected: `HANDOFF.md`, `docs/`가 untracked이고(`PLAN.md`는 사용자 결정에 따름), remote 출력이 없다.

- [ ] **Step 2: 문서 첫 commit** (`dev-workflow:commit` 사용)

```bash
git add HANDOFF.md docs/
git commit -m "📝 메모 분류함 기획 문서 추가"
```

- [ ] **Step 3: 작업 branch 생성**

Run: `git switch -c feat/memo-classifier-stage1`
Expected: `Switched to a new branch 'feat/memo-classifier-stage1'`

---

### Task 1: Git 무시 목록과 Postgres 컨테이너

**Files:**
- Create: `.gitignore`
- Create: `docker-compose.yml`
- Create: `db/init/01-create-test-db.sql`

**Interfaces:**
- Produces: `localhost:5433`의 Postgres, DB `memo`·`memo_test`, 계정 `memo`/`memo`

- [ ] **Step 1: `.gitignore` 작성**

```gitignore
node_modules/
dist/
coverage/
.env
.env.*
!.env.example
.DS_Store
```

- [ ] **Step 2: `db/init/01-create-test-db.sql` 작성**

```sql
CREATE DATABASE memo_test;
```

- [ ] **Step 3: `docker-compose.yml` 작성 (db만)**

```yaml
services:
  db:
    image: postgres:17
    environment:
      POSTGRES_USER: memo
      POSTGRES_PASSWORD: memo
      POSTGRES_DB: memo
    ports:
      - "5433:5432"
    volumes:
      - db-data:/var/lib/postgresql/data
      - ./db/init:/docker-entrypoint-initdb.d:ro
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U memo -d memo"]
      interval: 2s
      timeout: 3s
      retries: 15

volumes:
  db-data:
```

- [ ] **Step 4: db 실행과 DB 목록 확인**

Run: `docker compose up -d db && sleep 5 && docker compose exec db psql -U memo -d memo -c '\l'`
Expected: 목록에 `memo`와 `memo_test`가 모두 있다. `memo_test`가 없으면 volume이 이전에 만들어진 것이므로 `docker compose down -v` 후 다시 실행한다.

- [ ] **Step 5: Commit**

```bash
git add .gitignore docker-compose.yml db/
git commit -m "🐳 Postgres 컨테이너와 Git 무시 목록 추가"
```

---

### Task 2: NestJS server와 Prisma 메모 테이블

**Files:**
- Create: `server/` (Nest CLI 생성물)
- Delete: `server/src/app.controller.ts`, `server/src/app.service.ts`, `server/src/app.controller.spec.ts`, `server/test/app.e2e-spec.ts`
- Create: `server/prisma/schema.prisma`
- Create: `server/.env`, `server/.env.example`
- Create: `server/src/app.setup.ts`
- Create: `server/src/prisma/prisma.service.ts`, `server/src/prisma/prisma.module.ts`
- Modify: `server/src/app.module.ts`, `server/src/main.ts`, `server/package.json`

**Interfaces:**
- Consumes: Task 1의 Postgres(`localhost:5433`)
- Produces: `PrismaService`(`PrismaClient` 상속, `prisma.memo` 사용), `PrismaModule`(export `PrismaService`), `configureApp(app: INestApplication): void`(`/api` 접두어 설정), 테이블 `memos`

- [ ] **Step 1: Nest 프로젝트 생성**

Run (저장소 루트에서): `npx @nestjs/cli@11.0.24 new server --package-manager npm --skip-git --strict`
Expected: `server/`가 생기고 `Successfully created project server`가 출력된다.

- [ ] **Step 2: 예제 파일 삭제**

```bash
rm server/src/app.controller.ts server/src/app.service.ts server/src/app.controller.spec.ts server/test/app.e2e-spec.ts
```

- [ ] **Step 3: Prisma 설치**

Run: `cd server && npm install --save-exact @prisma/client@6.19.3 && npm install --save-dev --save-exact prisma@6.19.3`
Expected: `package.json`에 두 패키지가 `6.19.3`으로 들어간다.

- [ ] **Step 4: `server/.env`와 `server/.env.example` 작성 (내용 동일)**

```dotenv
DATABASE_URL="postgresql://memo:memo@localhost:5433/memo"
```

로컬 개발용 계정이라 비밀값이 아니다. `.env`는 `.gitignore`로 제외되고 `.env.example`만 commit된다.

- [ ] **Step 5: `server/prisma/schema.prisma` 작성**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Memo {
  id            String   @id @default(uuid())
  content       String   @db.VarChar(200)
  modelCategory String   @map("model_category")
  finalCategory String   @map("final_category")
  scores        Json?
  note          String?
  source        String
  createdAt     DateTime @default(now()) @map("created_at")

  @@map("memos")
}
```

- [ ] **Step 6: migration 생성과 적용**

Run: `cd server && npx prisma migrate dev --name init`
Expected: `server/prisma/migrations/<타임스탬프>_init/migration.sql`이 생기고 `Your database is now in sync with your schema.`와 `Generated Prisma Client`가 출력된다.

- [ ] **Step 7: `server/src/prisma/prisma.service.ts` 작성**

```ts
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
```

- [ ] **Step 8: `server/src/prisma/prisma.module.ts` 작성**

```ts
import { Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
```

- [ ] **Step 9: `server/src/app.setup.ts` 작성**

`main.ts`와 e2e 테스트가 같은 설정을 쓰도록 한곳에 둔다.

```ts
import { INestApplication } from '@nestjs/common';

export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix('api');
}
```

- [ ] **Step 10: `server/src/app.module.ts`를 아래 내용으로 교체**

```ts
import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [PrismaModule],
})
export class AppModule {}
```

- [ ] **Step 11: `server/src/main.ts`를 아래 내용으로 교체**

```ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  configureApp(app);
  app.enableShutdownHooks();
  await app.listen(process.env.PORT ?? 3000);
}

void bootstrap();
```

- [ ] **Step 12: 테스트 DB 준비 script 추가**

`server/package.json`의 `"scripts"`에 한 줄을 추가한다.

```json
"test:e2e:prepare": "DATABASE_URL=postgresql://memo:memo@localhost:5433/memo_test prisma migrate deploy",
```

Run: `cd server && npm run test:e2e:prepare`
Expected: `All migrations have been successfully applied.` 또는 `No pending migrations to apply.`

- [ ] **Step 13: 빌드와 실행 확인**

Run: `cd server && npm run build`
Expected: exit 0

Run: `cd server && npm run start:dev` (확인 후 Ctrl+C)
Expected: `Nest application successfully started`가 출력된다.

- [ ] **Step 14: Commit**

```bash
git add server/
git status --short server/   # server/.env가 목록에 없어야 한다
git commit -m "✨ NestJS 서버와 Prisma 메모 테이블 추가"
```

---

### Task 3: 키워드 규칙 분류기

**Files:**
- Create: `server/src/classifier/category.ts`
- Create: `server/src/classifier/rule-classifier.ts`
- Test: `server/src/classifier/rule-classifier.spec.ts`

**Interfaces:**
- Produces:
  - `CATEGORIES: readonly ['todo', 'idea', 'check', 'reference']`
  - `type Category = 'todo' | 'idea' | 'check' | 'reference'`
  - `isCategory(value: unknown): value is Category`
  - `type ClassifierSource = 'rule' | 'clef-flash'`
  - `interface ClassifyResult { category: Category; source: ClassifierSource; scores: Record<Category, number> | null; note: string | null }`
  - `interface Classifier { classify(content: string): Promise<ClassifyResult> }`
  - `CLASSIFIER: unique symbol` (Nest 주입 토큰)
  - `classifyByRules(content: string): ClassifyResult`
  - `class RuleClassifier implements Classifier`

- [ ] **Step 1: `server/src/classifier/category.ts` 작성**

```ts
export const CATEGORIES = ['todo', 'idea', 'check', 'reference'] as const;

export type Category = (typeof CATEGORIES)[number];

export function isCategory(value: unknown): value is Category {
  return (
    typeof value === 'string' &&
    (CATEGORIES as readonly string[]).includes(value)
  );
}

export type ClassifierSource = 'rule' | 'clef-flash';

export interface ClassifyResult {
  category: Category;
  source: ClassifierSource;
  /** 칸별 확률. Clef-flash만 채운다. */
  scores: Record<Category, number> | null;
  /** 규칙: 일치한 키워드, 대체 시: 마지막 실패 이유 */
  note: string | null;
}

export interface Classifier {
  classify(content: string): Promise<ClassifyResult>;
}

export const CLASSIFIER = Symbol('CLASSIFIER');
```

- [ ] **Step 2: 실패하는 테스트 작성 — `server/src/classifier/rule-classifier.spec.ts`**

```ts
import { classifyByRules, RuleClassifier } from './rule-classifier';

describe('classifyByRules', () => {
  it.each([
    ['배포 일정 PM한테 확인', 'check', "키워드 '확인' 일치"],
    ['이 API 왜 느리지?', 'check', "키워드 '?' 일치"],
    ['온보딩 문서를 영상으로 만들면 어떨까', 'idea', "키워드 '어떨까' 일치"],
    ['금요일까지 회의록 작성', 'todo', "키워드 '작성' 일치"],
    ['Node 24가 현재 LTS', 'reference', '일치한 키워드 없음'],
  ])('"%s" → %s', (content, category, note) => {
    expect(classifyByRules(content)).toEqual({
      category,
      source: 'rule',
      scores: null,
      note,
    });
  });

  it('여러 칸의 키워드가 함께 있으면 확인할 것 → 아이디어 → 할 일 순서로 고른다', () => {
    expect(classifyByRules('수정 방향 확인').category).toBe('check');
    expect(classifyByRules('개선안 작성').category).toBe('idea');
  });
});

describe('RuleClassifier', () => {
  it('classify는 classifyByRules 결과를 Promise로 돌려준다', async () => {
    await expect(new RuleClassifier().classify('회의록 작성')).resolves.toEqual(
      classifyByRules('회의록 작성'),
    );
  });
});
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `cd server && npx jest src/classifier`
Expected: FAIL — `Cannot find module './rule-classifier'`

- [ ] **Step 4: `server/src/classifier/rule-classifier.ts` 작성**

```ts
import { Injectable } from '@nestjs/common';
import { Category, Classifier, ClassifyResult } from './category';

/** 앞에 있는 규칙이 우선한다. */
const RULES: ReadonlyArray<{ category: Category; keywords: readonly string[] }> = [
  { category: 'check', keywords: ['확인', '문의', '물어', '알아보', '찾아보', '?', '？'] },
  { category: 'idea', keywords: ['아이디어', '어떨까', '하면 좋', '해보면', '개선'] },
  { category: 'todo', keywords: ['해야', '처리', '수정', '작성', '보내', '제출', '하기'] },
];

export function classifyByRules(content: string): ClassifyResult {
  for (const rule of RULES) {
    const matched = rule.keywords.find((keyword) => content.includes(keyword));
    if (matched) {
      return {
        category: rule.category,
        source: 'rule',
        scores: null,
        note: `키워드 '${matched}' 일치`,
      };
    }
  }
  return {
    category: 'reference',
    source: 'rule',
    scores: null,
    note: '일치한 키워드 없음',
  };
}

@Injectable()
export class RuleClassifier implements Classifier {
  classify(content: string): Promise<ClassifyResult> {
    return Promise.resolve(classifyByRules(content));
  }
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `cd server && npx jest src/classifier`
Expected: PASS (7 tests)

- [ ] **Step 6: Commit**

```bash
git add server/src/classifier/
git commit -m "✨ 키워드 규칙 분류기 추가"
```

---

### Task 4: 메모 입력 검사와 적중 집계

**Files:**
- Create: `server/src/memos/memo-input.ts`
- Create: `server/src/memos/memo-stats.ts`
- Test: `server/src/memos/memo-input.spec.ts`
- Test: `server/src/memos/memo-stats.spec.ts`

**Interfaces:**
- Consumes: Task 3의 `Category`, `isCategory`, `ClassifierSource`
- Produces:
  - `MAX_CONTENT_LENGTH = 200`
  - `parseContent(raw: unknown): string` — 앞뒤 공백 제거, 실패 시 `BadRequestException`
  - `parseCategory(raw: unknown): Category` — 실패 시 `BadRequestException`
  - `type HitCount = { hit: number; total: number }`
  - `type HitStats = Record<ClassifierSource, HitCount>`
  - `computeHitStats(memos: ReadonlyArray<{ source: string; modelCategory: string; finalCategory: string }>): HitStats`

- [ ] **Step 1: 실패하는 테스트 작성 — `server/src/memos/memo-input.spec.ts`**

```ts
import { BadRequestException } from '@nestjs/common';
import { parseCategory, parseContent } from './memo-input';

describe('parseContent', () => {
  it('앞뒤 공백을 지운다', () => {
    expect(parseContent('  회의록 작성  ')).toBe('회의록 작성');
  });

  it.each([[''], ['   '], ['\n\t ']])('공백뿐인 입력 %j는 거절한다', (raw) => {
    expect(() => parseContent(raw)).toThrow(BadRequestException);
  });

  it.each([[undefined], [null], [42], [{}]])('문자열이 아닌 %j는 거절한다', (raw) => {
    expect(() => parseContent(raw)).toThrow(BadRequestException);
  });

  it('한글 200자는 받고 201자는 거절한다', () => {
    expect(parseContent('가'.repeat(200))).toHaveLength(200);
    expect(() => parseContent('가'.repeat(201))).toThrow(BadRequestException);
  });

  it('이모지는 한 글자로 센다', () => {
    const twoHundred = '😀'.repeat(200);
    expect(parseContent(twoHundred)).toBe(twoHundred);
    expect(() => parseContent('😀'.repeat(201))).toThrow(BadRequestException);
  });

  it('오류 문구는 화면에 그대로 보여줄 한국어 문장이다', () => {
    expect(() => parseContent('가'.repeat(201))).toThrow(
      '메모는 200자 이하로 입력해 주세요.',
    );
    expect(() => parseContent(' ')).toThrow('메모를 입력해 주세요.');
  });
});

describe('parseCategory', () => {
  it.each(['todo', 'idea', 'check', 'reference'])('%s는 받는다', (raw) => {
    expect(parseCategory(raw)).toBe(raw);
  });

  it.each([['할 일'], ['TODO'], [undefined], [1]])('%j는 거절한다', (raw) => {
    expect(() => parseCategory(raw)).toThrow(BadRequestException);
  });
});
```

- [ ] **Step 2: 실패하는 테스트 작성 — `server/src/memos/memo-stats.spec.ts`**

```ts
import { computeHitStats } from './memo-stats';

describe('computeHitStats', () => {
  it('메모가 없으면 모두 0이다', () => {
    expect(computeHitStats([])).toEqual({
      'clef-flash': { hit: 0, total: 0 },
      rule: { hit: 0, total: 0 },
    });
  });

  it('출처별로 처음 칸과 현재 칸이 같은 메모를 적중으로 센다', () => {
    expect(
      computeHitStats([
        { source: 'rule', modelCategory: 'todo', finalCategory: 'todo' },
        { source: 'rule', modelCategory: 'todo', finalCategory: 'idea' },
        { source: 'clef-flash', modelCategory: 'check', finalCategory: 'check' },
      ]),
    ).toEqual({
      'clef-flash': { hit: 1, total: 1 },
      rule: { hit: 1, total: 2 },
    });
  });

  it('알 수 없는 출처는 세지 않는다', () => {
    expect(
      computeHitStats([
        { source: 'unknown', modelCategory: 'todo', finalCategory: 'todo' },
      ]).rule.total,
    ).toBe(0);
  });
});
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `cd server && npx jest src/memos`
Expected: FAIL — `Cannot find module './memo-input'`, `Cannot find module './memo-stats'`

- [ ] **Step 4: `server/src/memos/memo-input.ts` 작성**

```ts
import { BadRequestException } from '@nestjs/common';
import { Category, isCategory } from '../classifier/category';

export const MAX_CONTENT_LENGTH = 200;

export function parseContent(raw: unknown): string {
  if (typeof raw !== 'string') {
    throw new BadRequestException('메모를 입력해 주세요.');
  }
  const content = raw.trim();
  if (content.length === 0) {
    throw new BadRequestException('메모를 입력해 주세요.');
  }
  // code point 기준으로 센다. Postgres VARCHAR(200)과 같은 기준이다.
  if ([...content].length > MAX_CONTENT_LENGTH) {
    throw new BadRequestException(
      `메모는 ${MAX_CONTENT_LENGTH}자 이하로 입력해 주세요.`,
    );
  }
  return content;
}

export function parseCategory(raw: unknown): Category {
  if (!isCategory(raw)) {
    throw new BadRequestException('옮길 칸이 올바르지 않습니다.');
  }
  return raw;
}
```

- [ ] **Step 5: `server/src/memos/memo-stats.ts` 작성**

```ts
import { ClassifierSource } from '../classifier/category';

export type HitCount = { hit: number; total: number };
export type HitStats = Record<ClassifierSource, HitCount>;

export function computeHitStats(
  memos: ReadonlyArray<{
    source: string;
    modelCategory: string;
    finalCategory: string;
  }>,
): HitStats {
  const stats: HitStats = {
    'clef-flash': { hit: 0, total: 0 },
    rule: { hit: 0, total: 0 },
  };
  for (const memo of memos) {
    if (memo.source !== 'rule' && memo.source !== 'clef-flash') continue;
    const count = stats[memo.source];
    count.total += 1;
    if (memo.modelCategory === memo.finalCategory) count.hit += 1;
  }
  return stats;
}
```

- [ ] **Step 6: 테스트 통과 확인**

Run: `cd server && npx jest src/memos`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add server/src/memos/
git commit -m "✨ 메모 입력 검사와 적중 집계 추가"
```

---

### Task 5: 메모 API 3종

**Files:**
- Create: `server/src/memos/memo.dto.ts`
- Create: `server/src/memos/memos.service.ts`
- Create: `server/src/memos/memos.controller.ts`
- Create: `server/src/memos/memos.module.ts`
- Modify: `server/src/app.module.ts`
- Create: `server/test/setup-env.ts`
- Modify: `server/test/jest-e2e.json`
- Test: `server/test/memos.e2e-spec.ts`

**Interfaces:**
- Consumes: Task 2의 `PrismaService`, `PrismaModule`, `configureApp`; Task 3의 `Category`, `ClassifierSource`, `Classifier`, `CLASSIFIER`, `RuleClassifier`; Task 4의 `parseContent`, `parseCategory`, `computeHitStats`, `HitStats`
- Produces (HTTP):
  - `GET /api/memos` → `200 { memos: MemoDto[]; stats: HitStats }` (최신순)
  - `POST /api/memos` body `{ content: string }` → `201 MemoDto`, 검사 실패 시 `400 { message }`
  - `PATCH /api/memos/:id` body `{ category: Category }` → `200 MemoDto`, 잘못된 칸 `400`, 없는 id `404`
  - `MemoDto = { id: string; content: string; modelCategory: Category; finalCategory: Category; scores: Record<Category, number> | null; note: string | null; source: ClassifierSource; createdAt: string }`

- [ ] **Step 1: e2e 환경 설정**

`server/test/setup-env.ts`:

```ts
// 개발 DB(memo)를 건드리지 않도록 e2e 테스트는 memo_test를 쓴다.
process.env.DATABASE_URL = 'postgresql://memo:memo@localhost:5433/memo_test';
```

`server/test/jest-e2e.json`을 아래 내용으로 교체:

```json
{
  "moduleFileExtensions": ["js", "json", "ts"],
  "rootDir": ".",
  "testEnvironment": "node",
  "testRegex": ".e2e-spec.ts$",
  "transform": {
    "^.+\\.(t|j)s$": "ts-jest"
  },
  "setupFiles": ["<rootDir>/setup-env.ts"]
}
```

- [ ] **Step 2: 실패하는 테스트 작성 — `server/test/memos.e2e-spec.ts`**

```ts
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Memos API (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await prisma.memo.deleteMany();
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  describe('POST /api/memos', () => {
    it('규칙 분류기로 분류해 저장한다', async () => {
      const res = await http()
        .post('/api/memos')
        .send({ content: '  배포 일정 PM한테 확인  ' })
        .expect(201);

      expect(res.body).toMatchObject({
        content: '배포 일정 PM한테 확인',
        modelCategory: 'check',
        finalCategory: 'check',
        source: 'rule',
        scores: null,
        note: "키워드 '확인' 일치",
      });
      expect(typeof res.body.id).toBe('string');
      expect(new Date(res.body.createdAt).toString()).not.toBe('Invalid Date');
    });

    it('공백뿐인 메모는 400과 한국어 문구를 돌려준다', async () => {
      const res = await http().post('/api/memos').send({ content: '   ' }).expect(400);
      expect(res.body.message).toBe('메모를 입력해 주세요.');
    });

    it('body가 없어도 500이 아니라 400이다', async () => {
      await http().post('/api/memos').expect(400);
    });

    it('한글 200자는 저장하고 201자는 400이다', async () => {
      await http().post('/api/memos').send({ content: '가'.repeat(200) }).expect(201);
      await http().post('/api/memos').send({ content: '가'.repeat(201) }).expect(400);
    });

    it('이모지 200개도 DB에 저장된다 (앱과 DB의 글자 수 기준이 같다)', async () => {
      await http().post('/api/memos').send({ content: '😀'.repeat(200) }).expect(201);
    });
  });

  describe('GET /api/memos', () => {
    it('최신순 목록과 출처별 적중 횟수를 돌려준다', async () => {
      await prisma.memo.create({
        data: {
          content: '먼저 쓴 메모',
          modelCategory: 'todo',
          finalCategory: 'idea',
          source: 'rule',
          note: "키워드 '작성' 일치",
          createdAt: new Date('2026-10-01T00:00:00Z'),
        },
      });
      await prisma.memo.create({
        data: {
          content: '나중에 쓴 메모',
          modelCategory: 'reference',
          finalCategory: 'reference',
          source: 'rule',
          note: '일치한 키워드 없음',
          createdAt: new Date('2026-10-02T00:00:00Z'),
        },
      });

      const res = await http().get('/api/memos').expect(200);

      expect(res.body.memos.map((m: { content: string }) => m.content)).toEqual([
        '나중에 쓴 메모',
        '먼저 쓴 메모',
      ]);
      expect(res.body.stats).toEqual({
        'clef-flash': { hit: 0, total: 0 },
        rule: { hit: 1, total: 2 },
      });
    });
  });

  describe('PATCH /api/memos/:id', () => {
    it('칸을 옮기면 final만 바뀌고, 원래 칸으로 되돌리면 다시 적중이다', async () => {
      const created = await http()
        .post('/api/memos')
        .send({ content: '금요일까지 회의록 작성' })
        .expect(201);
      const id: string = created.body.id;

      const moved = await http()
        .patch(`/api/memos/${id}`)
        .send({ category: 'idea' })
        .expect(200);
      expect(moved.body).toMatchObject({ modelCategory: 'todo', finalCategory: 'idea' });
      expect((await http().get('/api/memos')).body.stats.rule).toEqual({ hit: 0, total: 1 });

      await http().patch(`/api/memos/${id}`).send({ category: 'todo' }).expect(200);
      expect((await http().get('/api/memos')).body.stats.rule).toEqual({ hit: 1, total: 1 });
    });

    it('잘못된 칸은 400이다', async () => {
      const created = await http().post('/api/memos').send({ content: '메모' }).expect(201);
      const res = await http()
        .patch(`/api/memos/${created.body.id}`)
        .send({ category: '할 일' })
        .expect(400);
      expect(res.body.message).toBe('옮길 칸이 올바르지 않습니다.');
    });

    it('없는 id는 404다', async () => {
      const res = await http()
        .patch('/api/memos/not-a-real-id')
        .send({ category: 'todo' })
        .expect(404);
      expect(res.body.message).toBe('메모를 찾을 수 없습니다.');
    });
  });
});
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `cd server && npm run test:e2e:prepare && npm run test:e2e`
Expected: FAIL — 라우트가 없어 `expected 201 "Created", got 404 "Not Found"` 등

- [ ] **Step 4: `server/src/memos/memo.dto.ts` 작성**

```ts
import type { Memo } from '@prisma/client';
import { Category, ClassifierSource } from '../classifier/category';

export interface MemoDto {
  id: string;
  content: string;
  modelCategory: Category;
  finalCategory: Category;
  scores: Record<Category, number> | null;
  note: string | null;
  source: ClassifierSource;
  createdAt: string;
}

/** DB에는 server만 쓰고, 쓸 때 parseCategory와 분류기 결과로 값을 검사하므로 여기서는 형만 맞춘다. */
export function toMemoDto(memo: Memo): MemoDto {
  return {
    id: memo.id,
    content: memo.content,
    modelCategory: memo.modelCategory as Category,
    finalCategory: memo.finalCategory as Category,
    scores: memo.scores as unknown as Record<Category, number> | null,
    note: memo.note,
    source: memo.source as ClassifierSource,
    createdAt: memo.createdAt.toISOString(),
  };
}
```

- [ ] **Step 5: `server/src/memos/memos.service.ts` 작성**

```ts
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Category, Classifier, CLASSIFIER } from '../classifier/category';
import { PrismaService } from '../prisma/prisma.service';
import { MemoDto, toMemoDto } from './memo.dto';
import { computeHitStats, HitStats } from './memo-stats';

@Injectable()
export class MemosService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CLASSIFIER) private readonly classifier: Classifier,
  ) {}

  async list(): Promise<{ memos: MemoDto[]; stats: HitStats }> {
    const memos = await this.prisma.memo.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return { memos: memos.map(toMemoDto), stats: computeHitStats(memos) };
  }

  async create(content: string): Promise<MemoDto> {
    const result = await this.classifier.classify(content);
    const memo = await this.prisma.memo.create({
      data: {
        content,
        modelCategory: result.category,
        finalCategory: result.category,
        scores: result.scores ?? Prisma.DbNull,
        note: result.note,
        source: result.source,
      },
    });
    return toMemoDto(memo);
  }

  async move(id: string, category: Category): Promise<MemoDto> {
    const existing = await this.prisma.memo.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('메모를 찾을 수 없습니다.');
    }
    const memo = await this.prisma.memo.update({
      where: { id },
      data: { finalCategory: category },
    });
    return toMemoDto(memo);
  }
}
```

- [ ] **Step 6: `server/src/memos/memos.controller.ts` 작성**

```ts
import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { parseCategory, parseContent } from './memo-input';
import { MemosService } from './memos.service';

@Controller('memos')
export class MemosController {
  constructor(private readonly memos: MemosService) {}

  @Get()
  list() {
    return this.memos.list();
  }

  @Post()
  create(@Body() body: { content?: unknown } | undefined) {
    return this.memos.create(parseContent(body?.content));
  }

  @Patch(':id')
  move(
    @Param('id') id: string,
    @Body() body: { category?: unknown } | undefined,
  ) {
    return this.memos.move(id, parseCategory(body?.category));
  }
}
```

- [ ] **Step 7: `server/src/memos/memos.module.ts` 작성**

```ts
import { Module } from '@nestjs/common';
import { CLASSIFIER } from '../classifier/category';
import { RuleClassifier } from '../classifier/rule-classifier';
import { PrismaModule } from '../prisma/prisma.module';
import { MemosController } from './memos.controller';
import { MemosService } from './memos.service';

@Module({
  imports: [PrismaModule],
  controllers: [MemosController],
  providers: [
    MemosService,
    // 2단계에서 Clef-flash 분류기로 바꿔 끼우는 지점
    { provide: CLASSIFIER, useClass: RuleClassifier },
  ],
})
export class MemosModule {}
```

- [ ] **Step 8: `server/src/app.module.ts`에 `MemosModule` 등록**

```ts
import { Module } from '@nestjs/common';
import { MemosModule } from './memos/memos.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [PrismaModule, MemosModule],
})
export class AppModule {}
```

- [ ] **Step 9: 테스트 통과 확인**

Run: `cd server && npm run test:e2e`
Expected: PASS (9 tests)

Run: `cd server && npm test`
Expected: PASS (Task 3·4 단위 테스트)

- [ ] **Step 10: Commit**

```bash
git add server/
git commit -m "✨ 메모 조회·저장·칸 이동 API 추가"
```

---

### Task 6: server Docker 실행 환경

**Files:**
- Create: `server/Dockerfile`
- Create: `server/.dockerignore`
- Modify: `docker-compose.yml`

**Interfaces:**
- Consumes: Task 5의 API
- Produces: `docker compose up`으로 `localhost:3000/api/*`가 응답하는 server 컨테이너

- [ ] **Step 1: 호스트에서 띄운 server가 있으면 종료**

Run: `lsof -i :3000`
Expected: 출력 없음. 출력이 있으면 그 `npm run start:dev`를 Ctrl+C로 끈다.

- [ ] **Step 2: `server/.dockerignore` 작성**

```
node_modules
dist
.env
.env.*
```

- [ ] **Step 3: `server/Dockerfile` 작성**

```dockerfile
FROM node:24-bookworm-slim

# Prisma 엔진이 openssl을 쓴다.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npx prisma generate

EXPOSE 3000
CMD ["sh", "-c", "npx prisma migrate deploy && npm run start:dev"]
```

- [ ] **Step 4: `docker-compose.yml`에 server 추가 (전체 교체)**

```yaml
services:
  db:
    image: postgres:17
    environment:
      POSTGRES_USER: memo
      POSTGRES_PASSWORD: memo
      POSTGRES_DB: memo
    ports:
      - "5433:5432"
    volumes:
      - db-data:/var/lib/postgresql/data
      - ./db/init:/docker-entrypoint-initdb.d:ro
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U memo -d memo"]
      interval: 2s
      timeout: 3s
      retries: 15

  server:
    build: ./server
    environment:
      DATABASE_URL: postgresql://memo:memo@db:5432/memo
    ports:
      - "3000:3000"
    depends_on:
      db:
        condition: service_healthy
    volumes:
      # 코드 수정이 컨테이너에 바로 반영되게 한다. schema.prisma를 바꾸면 --build로 다시 띄운다.
      - ./server/src:/app/src
      - ./server/prisma:/app/prisma

volumes:
  db-data:
```

- [ ] **Step 5: 실행 확인**

Run: `docker compose up -d --build && sleep 15 && docker compose logs server --tail 20`
Expected: 로그에 `No pending migrations to apply.`(또는 적용 완료)와 `Nest application successfully started`가 있다.

Run: `curl -s localhost:3000/api/memos`
Expected: `{"memos":[...],"stats":{"clef-flash":{"hit":0,"total":0},"rule":{...}}}` 형태의 JSON

Run: `curl -s -X POST localhost:3000/api/memos -H 'Content-Type: application/json' -d '{"content":"도커 확인"}'`
Expected: `"modelCategory":"check"`가 들어간 JSON

- [ ] **Step 6: 코드 수정 반영 확인**

`server/src/memos/memos.controller.ts`에 공백 한 줄을 넣고 저장한 뒤 `docker compose logs server --tail 5`에 재시작 로그가 찍히는지 본다. 확인 후 공백을 되돌린다.

- [ ] **Step 7: Commit**

```bash
git add server/Dockerfile server/.dockerignore docker-compose.yml
git commit -m "🐳 server Docker 실행 환경 추가"
```

---

### Task 7: web 앱과 API client

**Files:**
- Create: `web/` (create-vite 생성물)
- Modify: `web/vite.config.ts`
- Create: `web/src/api.ts`

**Interfaces:**
- Consumes: Task 5의 HTTP API (`MemoDto`, `HitStats` 모양)
- Produces:
  - `type Category`, `CATEGORIES`, `CATEGORY_LABELS: Record<Category, string>`
  - `type ClassifierSource`, `SOURCE_LABELS: Record<ClassifierSource, string>`
  - `interface Memo`(= server `MemoDto`), `type HitStats`
  - `fetchMemos(): Promise<{ memos: Memo[]; stats: HitStats }>`
  - `createMemo(content: string): Promise<Memo>`
  - `moveMemo(id: string, category: Category): Promise<Memo>`
  - 실패 시 모두 `Error(message)`를 던지며, `message`는 화면에 그대로 보여줄 문장이다.

- [ ] **Step 1: web 프로젝트 생성**

Run (저장소 루트에서): `npm create vite@9.2.1 web -- --template react-ts`
Expected: `web/`가 생긴다. "지금 설치하고 실행할지" 묻는 질문이 나오면 No를 고른다.

Run: `cd web && npm install`
Expected: exit 0

- [ ] **Step 2: `web/vite.config.ts`에 proxy 추가**

생성된 파일의 plugin import는 그대로 두고 `server` 항목만 추가한다. 결과는 아래와 같은 모양이다.

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
});
```

- [ ] **Step 3: `web/src/api.ts` 작성**

```ts
export const CATEGORIES = ['todo', 'idea', 'check', 'reference'] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<Category, string> = {
  todo: '할 일',
  idea: '아이디어',
  check: '확인할 것',
  reference: '참고',
};

export type ClassifierSource = 'rule' | 'clef-flash';

export const SOURCE_LABELS: Record<ClassifierSource, string> = {
  rule: '규칙',
  'clef-flash': 'Clef-flash',
};

export interface Memo {
  id: string;
  content: string;
  modelCategory: Category;
  finalCategory: Category;
  scores: Record<Category, number> | null;
  note: string | null;
  source: ClassifierSource;
  createdAt: string;
}

export type HitCount = { hit: number; total: number };
export type HitStats = Record<ClassifierSource, HitCount>;

const SERVER_DOWN_MESSAGE =
  '서버에 연결할 수 없습니다. server가 실행 중인지 확인해 주세요.';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    throw new Error(SERVER_DOWN_MESSAGE);
  }
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      body && typeof body === 'object' && 'message' in body && typeof body.message === 'string'
        ? body.message
        : res.status >= 500
          ? SERVER_DOWN_MESSAGE
          : `요청에 실패했습니다 (${res.status}).`;
    throw new Error(message);
  }
  return body as T;
}

export function fetchMemos(): Promise<{ memos: Memo[]; stats: HitStats }> {
  return request('/api/memos');
}

export function createMemo(content: string): Promise<Memo> {
  return request('/api/memos', {
    method: 'POST',
    body: JSON.stringify({ content }),
  });
}

export function moveMemo(id: string, category: Category): Promise<Memo> {
  return request(`/api/memos/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ category }),
  });
}
```

- [ ] **Step 4: 타입 검사와 proxy 확인**

Run: `cd web && npm run build`
Expected: exit 0

Run: `cd web && npm run dev` 를 띄운 상태에서 다른 터미널로 `curl -s localhost:5173/api/memos`
Expected: Task 6에서 본 것과 같은 JSON (server 컨테이너가 떠 있어야 한다)

- [ ] **Step 5: Commit**

```bash
git add web/
git commit -m "✨ web 앱과 메모 API client 추가"
```

---

### Task 8: 메모 보드 화면

**Files:**
- Create: `web/src/components/MemoInput.tsx`
- Create: `web/src/components/MemoCard.tsx`
- Create: `web/src/components/Board.tsx`
- Create: `web/src/components/HitStatsBar.tsx`
- Modify: `web/src/App.tsx` (전체 교체)
- Modify: `web/src/App.css` (전체 교체)
- Modify: `web/src/index.css` (전체 교체)
- Delete: `web/src/assets/` (create-vite 예제 이미지, 쓰지 않음)

**Interfaces:**
- Consumes: Task 7의 `api.ts` 전부

- [ ] **Step 1: `web/src/components/MemoInput.tsx` 작성**

```tsx
import { useState, type FormEvent } from 'react';

const MAX_LENGTH = 200;

interface Props {
  /** 저장에 성공하면 true. true일 때만 입력창을 비운다. */
  onSubmit: (content: string) => Promise<boolean>;
  disabled: boolean;
}

export function MemoInput({ onSubmit, disabled }: Props) {
  const [value, setValue] = useState('');
  const content = value.trim();
  const length = [...content].length;
  const tooLong = length > MAX_LENGTH;
  const canSubmit = !disabled && length > 0 && !tooLong;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    if (await onSubmit(content)) setValue('');
  }

  return (
    <form className="memo-input" onSubmit={(event) => void handleSubmit(event)}>
      <input
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="떠오른 생각을 한 줄로 적어 보세요"
        aria-label="메모"
      />
      <span className={tooLong ? 'counter over' : 'counter'}>
        {length}/{MAX_LENGTH}
      </span>
      <button type="submit" disabled={!canSubmit}>
        {disabled ? '분류 중…' : '분류'}
      </button>
    </form>
  );
}
```

- [ ] **Step 2: `web/src/components/MemoCard.tsx` 작성**

```tsx
import {
  CATEGORIES,
  CATEGORY_LABELS,
  SOURCE_LABELS,
  type Category,
  type Memo,
} from '../api';

interface Props {
  memo: Memo;
  onMove: (id: string, category: Category) => void;
}

export function MemoCard({ memo, onMove }: Props) {
  return (
    <article className="card">
      <p className="content">{memo.content}</p>
      <div className="meta">
        <span className={`badge ${memo.source}`}>{SOURCE_LABELS[memo.source]}</span>
        {memo.note && <span className="note">{memo.note}</span>}
      </div>
      {memo.modelCategory !== memo.finalCategory && (
        <p className="moved">처음 분류: {CATEGORY_LABELS[memo.modelCategory]}</p>
      )}
      <label className="move">
        칸 이동
        <select
          value={memo.finalCategory}
          onChange={(event) => onMove(memo.id, event.target.value as Category)}
        >
          {CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {CATEGORY_LABELS[category]}
            </option>
          ))}
        </select>
      </label>
    </article>
  );
}
```

- [ ] **Step 3: `web/src/components/Board.tsx` 작성**

```tsx
import { CATEGORIES, CATEGORY_LABELS, type Category, type Memo } from '../api';
import { MemoCard } from './MemoCard';

interface Props {
  memos: Memo[];
  onMove: (id: string, category: Category) => void;
}

export function Board({ memos, onMove }: Props) {
  return (
    <section className="board">
      {CATEGORIES.map((category) => {
        const items = memos.filter((memo) => memo.finalCategory === category);
        return (
          <div key={category} className="column">
            <h2>
              {CATEGORY_LABELS[category]} <span className="count">{items.length}</span>
            </h2>
            {items.length === 0 ? (
              <p className="empty">아직 없습니다</p>
            ) : (
              items.map((memo) => <MemoCard key={memo.id} memo={memo} onMove={onMove} />)
            )}
          </div>
        );
      })}
    </section>
  );
}
```

- [ ] **Step 4: `web/src/components/HitStatsBar.tsx` 작성**

```tsx
import { SOURCE_LABELS, type ClassifierSource, type HitStats } from '../api';

const ORDER: ClassifierSource[] = ['clef-flash', 'rule'];

export function HitStatsBar({ stats }: { stats: HitStats }) {
  return (
    <p className="hit-stats">
      적중{' '}
      {ORDER.map((source) => `${SOURCE_LABELS[source]} ${stats[source].hit}/${stats[source].total}`).join(' · ')}
    </p>
  );
}
```

- [ ] **Step 5: `web/src/App.tsx` 전체 교체**

```tsx
import { useCallback, useEffect, useState } from 'react';
import { createMemo, fetchMemos, moveMemo, type Category, type HitStats, type Memo } from './api';
import { Board } from './components/Board';
import { HitStatsBar } from './components/HitStatsBar';
import { MemoInput } from './components/MemoInput';
import './App.css';

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.';
}

export default function App() {
  const [memos, setMemos] = useState<Memo[]>([]);
  const [stats, setStats] = useState<HitStats | null>(null);
  const [pendingContent, setPendingContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const data = await fetchMemos();
    setMemos(data.memos);
    setStats(data.stats);
  }, []);

  useEffect(() => {
    reload().catch((e: unknown) => setError(toMessage(e)));
  }, [reload]);

  async function handleSubmit(content: string): Promise<boolean> {
    setError(null);
    setPendingContent(content);
    try {
      await createMemo(content);
    } catch (e) {
      setError(toMessage(e));
      setPendingContent(null);
      return false; // 저장 실패: 입력창의 메모를 그대로 둔다
    }
    setPendingContent(null);
    // 저장은 끝났으므로 목록 갱신이 실패해도 입력창은 비운다(같은 메모의 중복 저장 방지).
    await reload().catch((e: unknown) => setError(toMessage(e)));
    return true;
  }

  function handleMove(id: string, category: Category) {
    setError(null);
    moveMemo(id, category)
      .then(reload)
      .catch((e: unknown) => setError(toMessage(e)));
  }

  return (
    <main className="app">
      <header className="app-header">
        <h1>메모 분류함</h1>
        {stats && <HitStatsBar stats={stats} />}
      </header>
      <MemoInput onSubmit={handleSubmit} disabled={pendingContent !== null} />
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {pendingContent && (
        <div className="card pending" aria-live="polite">
          <p className="content">{pendingContent}</p>
          <p className="note">분류 중…</p>
        </div>
      )}
      <Board memos={memos} onMove={handleMove} />
    </main>
  );
}
```

- [ ] **Step 6: `web/src/index.css` 전체 교체**

```css
:root {
  --bg: #f6f7f9;
  --surface: #ffffff;
  --text: #1d2129;
  --muted: #6b7280;
  --border: #e3e6ea;
  --accent: #2f6fde;
  --danger: #c62828;
  font-family: system-ui, -apple-system, 'Apple SD Gothic Neo', sans-serif;
  color: var(--text);
  background: var(--bg);
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg: #15171b;
    --surface: #1f2228;
    --text: #e8eaed;
    --muted: #9aa0a6;
    --border: #33373e;
    --accent: #7aa7ff;
    --danger: #ff8a80;
  }
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  background: var(--bg);
}
```

- [ ] **Step 7: `web/src/App.css` 전체 교체**

```css
.app {
  max-width: 1200px;
  margin: 0 auto;
  padding: 24px 16px 48px;
}

.app-header {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}

.app-header h1 {
  margin: 0;
  font-size: 1.5rem;
}

.hit-stats {
  margin: 0;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}

.memo-input {
  display: flex;
  gap: 8px;
  align-items: center;
  margin: 16px 0;
}

.memo-input input {
  flex: 1;
  min-width: 0;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  color: var(--text);
  font-size: 1rem;
}

.counter {
  color: var(--muted);
  font-size: 0.85rem;
  font-variant-numeric: tabular-nums;
}

.counter.over {
  color: var(--danger);
}

.memo-input button {
  padding: 10px 16px;
  border: 0;
  border-radius: 8px;
  background: var(--accent);
  color: #fff;
  font-size: 1rem;
  cursor: pointer;
}

.memo-input button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.error {
  color: var(--danger);
  margin: 0 0 12px;
}

.board {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

@media (max-width: 900px) {
  .board {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 520px) {
  .board {
    grid-template-columns: 1fr;
  }
}

.column {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 12px;
  min-height: 160px;
}

.column h2 {
  margin: 0 0 8px;
  font-size: 1rem;
}

.count {
  color: var(--muted);
  font-weight: normal;
}

.empty {
  color: var(--muted);
  font-size: 0.9rem;
}

.card {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 10px;
  margin-bottom: 8px;
  background: var(--bg);
}

.card.pending {
  margin-bottom: 12px;
  border-style: dashed;
}

.card .content {
  margin: 0 0 6px;
  overflow-wrap: anywhere;
}

.meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  font-size: 0.8rem;
}

.badge {
  padding: 2px 6px;
  border-radius: 4px;
  border: 1px solid var(--border);
}

.badge.clef-flash {
  border-color: var(--accent);
  color: var(--accent);
}

.note,
.moved {
  color: var(--muted);
  font-size: 0.8rem;
  margin: 4px 0 0;
}

.move {
  display: flex;
  gap: 6px;
  align-items: center;
  margin-top: 8px;
  font-size: 0.8rem;
  color: var(--muted);
}

.move select {
  font-size: 0.8rem;
}
```

- [ ] **Step 8: 예제 이미지 삭제와 빌드 확인**

Run: `rm -rf web/src/assets && cd web && npm run build`
Expected: exit 0. 실패하면 `App.tsx` 외에 `assets`를 import하는 파일이 남았는지 확인한다.

- [ ] **Step 9: 화면 확인**

`docker compose up -d`와 `cd web && npm run dev`를 띄우고 `http://localhost:5173`에서 확인한다.

- `금요일까지 회의록 작성` 입력 → `할 일` 칸에 카드, 배지 `규칙`, `키워드 '작성' 일치`
- 그 카드의 칸 이동에서 `아이디어` 선택 → `아이디어` 칸으로 이동, `처음 분류: 할 일` 표시, 적중 `규칙 0/1`
- 다시 `할 일`로 이동 → 적중 `규칙 1/1`, `처음 분류` 문구 사라짐
- 공백만 입력 → 분류 버튼 비활성
- 201자 붙여넣기 → 글자 수가 빨갛게 바뀌고 버튼 비활성
- 새로고침 → 카드와 적중 횟수 유지
- 창 너비 520px 이하 → 칸이 한 줄에 하나씩

- [ ] **Step 10: Commit**

```bash
git add web/
git commit -m "✨ 메모 입력과 4칸 보드 화면 추가"
```

---

### Task 9: 1단계 완료 확인과 실행 안내

**Files:**
- Create: `README.md`

- [ ] **Step 1: `README.md` 작성**

````markdown
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
````

- [ ] **Step 2: 깨끗한 상태에서 다시 실행**

Run: `docker compose down -v && docker compose up -d --build && sleep 20 && curl -s localhost:3000/api/memos`
Expected: `{"memos":[],"stats":{"clef-flash":{"hit":0,"total":0},"rule":{"hit":0,"total":0}}}`

- [ ] **Step 3: 테스트 전체 실행**

Run: `cd server && npm test && npm run test:e2e:prepare && npm run test:e2e`
Expected: 단위·e2e 모두 PASS

- [ ] **Step 4: server가 꺼졌을 때 화면 확인 (Review Focus 4)**

`npm run dev`는 켜 둔 채 `docker compose stop server` → 화면에서 `회의록 작성` 입력 후 분류
Expected: `서버에 연결할 수 없습니다. server가 실행 중인지 확인해 주세요.`가 보이고 입력창에 `회의록 작성`이 남아 있다.
확인 후 `docker compose start server`.

- [ ] **Step 5: 분류 버튼 연타 확인**

`회의록 작성` 입력 후 분류 버튼을 빠르게 여러 번 누른다.
Expected: 카드가 1개만 생긴다(처리 중에는 버튼이 비활성).

- [ ] **Step 6: Git에 비밀값이 없는지 확인**

Run: `git ls-files | grep -E '(^|/)\.env$'`
Expected: 출력 없음

- [ ] **Step 7: Commit**

```bash
git add README.md
git commit -m "📝 실행·테스트 방법 안내 추가"
```

- [ ] **Step 8: HANDOFF.md 갱신**

`itnew-dev:itnew-handoff` 규칙대로 1단계 완료, 마지막 commit SHA, 다음 단계(2단계 전 확인 항목: 설계 문서 12절)를 적는다.
