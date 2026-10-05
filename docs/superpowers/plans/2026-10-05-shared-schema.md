# 공유 zod schema Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **사람이 읽을 부분:** 맨 위의 Goal부터 Review Focus까지와, 각 Task 제목 아래의 **Files**·**Interfaces**만 보면 된다. 나머지 코드 블록은 구현 subagent가 그대로 옮겨 쓰는 내용이다.

**Goal:** web과 server에 중복 정의된 API 계약(칸 값, 요청 body 규칙, 응답 DTO, 적중 집계)을 `@memo/shared` zod schema 한곳으로 모으고, npm을 pnpm workspaces로 바꾼다. 화면·API 동작과 오류 문구는 바뀌지 않는다.

**Architecture:** 루트에 pnpm workspace(`server`, `web`, `packages/*`)를 두고, `packages/shared`를 tsup으로 CJS·ESM·타입 선언 동시 build한다. server(Nest, CommonJS)는 `require` 경로로, web(Vite, ESM)은 `import` 경로로 같은 package를 쓴다. Docker build 범위는 저장소 루트로 넓히고 corepack으로 pnpm을 켠다.

**Tech Stack:** pnpm 12.4.1, zod 4.6.5, tsup 8.5.1, vitest 5.0.3(shared 테스트), TypeScript 5.9.3(shared), 기존 NestJS 11·Prisma 6.19.3·React·Vite·Docker Compose

**Spec:** `docs/superpowers/specs/2026-10-05-shared-schema-design.md`

## Global Constraints

- 화면·API 동작과 오류 문구를 바꾸지 않는다. 문구는 정확히 `메모를 입력해 주세요.`, `메모는 200자 이하로 입력해 주세요.`, `옮길 칸이 올바르지 않습니다.`, `메모를 찾을 수 없습니다.`, `서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.`이다.
- **`server/test/*.e2e-spec.ts`는 수정하지 않는다.** 수정 없이 11개가 통과하는 것이 "동작이 바뀌지 않았다"의 증거다. e2e가 import하는 `MemoDto`(`server/src/memos/memo.dto.ts`)와 `HitStats`(`server/src/memos/memo-stats.ts`) 이름은 계속 export한다.
- 버전 고정: `packageManager: "pnpm@12.4.1"`, `zod@4.6.5`, `tsup@8.5.1`, `vitest@5.0.3`, shared의 `typescript@5.9.3`. 설치는 `--save-exact` 효과가 나도록 정확한 버전을 적는다.
- pnpm 12는 의존성의 설치 script가 허용되지 않으면 `ERR_PNPM_IGNORED_BUILDS`로 실패한다. 허용 목록은 `pnpm approve-builds <이름…> -y`로 `pnpm-workspace.yaml`의 `allowBuilds`에 기록한다. Prisma(`prisma`, `@prisma/client`, `@prisma/engines`)와 `esbuild`는 허용하고, 그 밖의 package는 `!이름`으로 거부한다.
- Prisma schema와 DB 구조는 바꾸지 않는다.
- 칸 값·출처 값·응답 타입의 정의는 `packages/shared`에만 둔다. server·web에는 re-export만 허용한다. 화면 문구(`CATEGORY_LABELS`, `SOURCE_LABELS`)와 server 내부 타입(`ClassifyResult`, `Classifier`, `CLASSIFIER`)은 제자리에 둔다.
- Docker stack은 한 번에 한 폴더에서만 띄운다(포트 5433, 3000). 이 계획의 모든 명령은 worktree 루트에서 실행한다.
- `server/.env`는 commit하지 않는다.
- commit은 local만 한다. 제목 형식은 `<emoji> <type>: <한국어 제목>`이고 동작 명사로 끝낸다. 본문은 존댓말로 쓴다. push는 하지 않는다.

## Review Focus

1. body가 없거나 객체가 아닌 요청(`undefined`, 문자열, 배열): 500이 아니라 400과 한국어 문구 → Task 2 테스트
2. 새로 clone한 상태의 실행 순서: shared를 build하기 전에 server 테스트나 web dev를 돌리면 `@memo/shared`를 못 찾는다. README 순서대로 하면 처음부터 동작해야 한다 → Task 6 확인
3. 처음부터 Docker build: frozen lockfile, filter 설치, `allowBuilds`, Prisma client 생성이 모두 맞아야 server가 뜬다 → Task 5 확인
4. shared를 고친 뒤 반영: web은 watch build로, server 컨테이너는 `--build`로 반영돼야 한다 → Task 6 README
5. server 응답과 shared `MemoSchema`의 모양이 같아야 한다: `toMemoDto`가 shared 타입을 반환하도록 타입 검사로 묶는다 → Task 3 build

---

### Task 0: worktree와 설계 문서 commit (controller가 직접 실행)

**Files:** `HANDOFF.md`, `docs/superpowers/specs/2026-10-05-shared-schema-design.md`, 이 계획 파일

- [ ] **Step 1:** `superpowers:using-git-worktrees`로 branch `refactor/shared-zod-schema`의 worktree를 만든다. 원래 폴더의 미commit 파일(위 3개)을 worktree로 옮긴다.
- [ ] **Step 2:** 원래 폴더의 Docker stack이 내려가 있는지 확인한다. Run: `docker ps --format '{{.Names}}' | grep jev-test` → Expected: 출력 없음
- [ ] **Step 3:** worktree에서 commit

```bash
git add HANDOFF.md docs/superpowers/specs/2026-10-05-shared-schema-design.md docs/superpowers/plans/2026-10-05-shared-schema.md
git commit -m "📝 docs: 공유 zod schema 설계와 구현 계획 추가"
```

---

### Task 1: npm을 pnpm workspaces로 전환

**Files:**
- Create: `package.json`(루트), `pnpm-workspace.yaml`, `pnpm-lock.yaml`(생성됨)
- Delete: `server/package-lock.json`, `web/package-lock.json`
- Create(commit 안 함): `server/.env`(`server/.env.example` 복사)

**Interfaces:**
- Produces: 루트에서 `pnpm -F server <script>`, `pnpm -F web <script>`가 동작하는 workspace. 루트 script `dev:web`, `test`, `test:e2e`.

- [ ] **Step 1: 루트 `package.json` 작성**

```json
{
  "name": "memo-triage",
  "private": true,
  "packageManager": "pnpm@12.4.1",
  "scripts": {
    "dev:web": "pnpm -F web dev",
    "test": "pnpm -r --if-present test",
    "test:e2e": "pnpm -F server test:e2e"
  }
}
```

- [ ] **Step 2: `pnpm-workspace.yaml` 작성**

```yaml
packages:
  - server
  - web
  - packages/*
```

- [ ] **Step 3: npm lockfile 삭제와 설치**

```bash
rm server/package-lock.json web/package-lock.json
pnpm install
```

Expected: `ERR_PNPM_IGNORED_BUILDS`와 함께 막힌 package 목록이 출력된다.

- [ ] **Step 4: 설치 script 허용**

Step 3 목록 중 `prisma`, `@prisma/client`, `@prisma/engines`, `esbuild`(있다면)는 허용하고 나머지는 `!이름`으로 거부한다. 예:

```bash
pnpm approve-builds prisma @prisma/client @prisma/engines '!@nestjs/core' -y
```

Run: `cat pnpm-workspace.yaml && pnpm install --frozen-lockfile`
Expected: `allowBuilds:` 아래에 허용(`true`)·거부(`false`) 목록이 있고, 설치가 exit 0으로 끝난다.

- [ ] **Step 5: 환경 파일과 테스트 DB 준비**

```bash
cp server/.env.example server/.env
docker compose up -d db
pnpm -F server exec prisma generate
pnpm -F server test:e2e:prepare
```

Expected: `Generated Prisma Client`, `All migrations have been successfully applied.`

- [ ] **Step 6: 기존 검증이 pnpm에서도 통과하는지 확인**

Run: `pnpm -F server test && pnpm test:e2e && pnpm -F server build && pnpm -F server exec eslint src && pnpm -F web build && pnpm -F web lint`
Expected: server 단위 29개, e2e 11개 통과, build·lint exit 0. web lint는 기존 경고 1건(`set-state-in-effect`)만 허용한다. pnpm의 엄격한 의존성 때문에 `Cannot find module`이 나면, 그 package를 해당 앱 `package.json`에 정확한 버전으로 추가한다(유령 의존성).

Note: 이 Task 이후 Task 5 전까지는 server **컨테이너** build가 깨져 있다(Dockerfile이 아직 `npm ci`). `docker compose up -d db`만 쓴다.

- [ ] **Step 7: Commit**

```bash
git add package.json pnpm-workspace.yaml pnpm-lock.yaml server/package.json web/package.json
git add -u server/package-lock.json web/package-lock.json
git status --short   # server/.env가 없어야 한다
git commit -m "🔧 chore: npm에서 pnpm workspaces로 전환"
```

---

### Task 2: `@memo/shared` 공유 schema package

**Files:**
- Create: `packages/shared/package.json`, `packages/shared/tsconfig.json`, `packages/shared/tsup.config.ts`, `packages/shared/src/index.ts`, `packages/shared/src/memo.ts`
- Test: `packages/shared/test/memo.test.ts`
- Modify: 루트 `package.json`(script 2개 추가)

**Interfaces:**
- Produces (`@memo/shared`):
  - `CATEGORIES: readonly ['todo', 'idea', 'check', 'reference']`, `CategorySchema`, `type Category`
  - `CLASSIFIER_SOURCES: readonly ['rule', 'clef-flash']`, `ClassifierSourceSchema`, `type ClassifierSource`
  - `MAX_CONTENT_LENGTH = 200`, `MemoContentSchema`
  - `CreateMemoBodySchema`(`{ content: string }`, 앞뒤 공백 제거), `type CreateMemoBody`
  - `MoveMemoBodySchema`(`{ category: Category }`), `type MoveMemoBody`
  - `ScoresSchema`(`Record<Category, number>`), `MemoSchema`, `type Memo`(= 기존 `MemoDto` 모양)
  - `HitCountSchema`, `type HitCount`, `HitStatsSchema`, `type HitStats`(키 `rule`, `clef-flash`)
  - `MemoListResponseSchema`, `type MemoListResponse`(`{ memos: Memo[]; stats: HitStats }`)
- 루트 script: `build:shared`, `dev:shared`

- [ ] **Step 1: package 설정 파일 작성**

`packages/shared/package.json`:

```json
{
  "name": "@memo/shared",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.cjs",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": { "types": "./dist/index.d.ts", "default": "./dist/index.js" },
      "require": { "types": "./dist/index.d.cts", "default": "./dist/index.cjs" }
    }
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "zod": "4.6.5"
  },
  "devDependencies": {
    "tsup": "8.5.1",
    "typescript": "5.9.3",
    "vitest": "5.0.3"
  }
}
```

`packages/shared/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "skipLibCheck": true,
    "declaration": true,
    "noEmit": true
  },
  "include": ["src", "test"]
}
```

`packages/shared/tsup.config.ts`:

```ts
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  clean: true,
});
```

루트 `package.json`의 `scripts`에 추가:

```json
"build:shared": "pnpm -F @memo/shared build",
"dev:shared": "pnpm -F @memo/shared dev",
```

Run: `pnpm install`
Expected: exit 0. `esbuild`가 막혔다고 나오면 `pnpm approve-builds esbuild -y` 후 다시 `pnpm install`.

- [ ] **Step 2: 실패하는 테스트 작성 — `packages/shared/test/memo.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import {
  CATEGORIES,
  CreateMemoBodySchema,
  HitStatsSchema,
  MAX_CONTENT_LENGTH,
  MemoSchema,
  MoveMemoBodySchema,
} from '../src';

type SafeParse = { success: true } | { success: false; error: { issues: { message: string }[] } };
const messageOf = (result: SafeParse) =>
  result.success ? undefined : result.error.issues[0]?.message;

describe('상수', () => {
  it('칸 목록과 글자 수 상한', () => {
    expect(CATEGORIES).toEqual(['todo', 'idea', 'check', 'reference']);
    expect(MAX_CONTENT_LENGTH).toBe(200);
  });
});

describe('CreateMemoBodySchema', () => {
  it('앞뒤 공백을 지운다', () => {
    expect(CreateMemoBodySchema.parse({ content: '  회의록 작성  ' })).toEqual({ content: '회의록 작성' });
  });

  it.each([[''], ['   '], ['\n\t ']])('공백뿐인 content %j는 거절한다', (content) => {
    expect(messageOf(CreateMemoBodySchema.safeParse({ content }))).toBe('메모를 입력해 주세요.');
  });

  it.each([[undefined], [null], [42], [{}]])('문자열이 아닌 content %j는 거절한다', (content) => {
    expect(messageOf(CreateMemoBodySchema.safeParse({ content }))).toBe('메모를 입력해 주세요.');
  });

  it.each([[undefined], [null], ['회의록'], [[]]])('객체가 아닌 body %j는 거절한다', (body) => {
    expect(messageOf(CreateMemoBodySchema.safeParse(body))).toBe('메모를 입력해 주세요.');
  });

  it('한글 200자는 받고 201자는 거절한다', () => {
    expect(CreateMemoBodySchema.safeParse({ content: '가'.repeat(200) }).success).toBe(true);
    expect(messageOf(CreateMemoBodySchema.safeParse({ content: '가'.repeat(201) }))).toBe(
      '메모는 200자 이하로 입력해 주세요.',
    );
  });

  it('이모지는 한 글자로 센다', () => {
    expect(CreateMemoBodySchema.safeParse({ content: '😀'.repeat(200) }).success).toBe(true);
    expect(CreateMemoBodySchema.safeParse({ content: '😀'.repeat(201) }).success).toBe(false);
  });
});

describe('MoveMemoBodySchema', () => {
  it.each(['todo', 'idea', 'check', 'reference'])('%s는 받는다', (category) => {
    expect(MoveMemoBodySchema.parse({ category })).toEqual({ category });
  });

  it.each([['할 일'], ['TODO'], [undefined], [1]])('category %j는 거절한다', (category) => {
    expect(messageOf(MoveMemoBodySchema.safeParse({ category }))).toBe('옮길 칸이 올바르지 않습니다.');
  });

  it('body가 없으면 거절한다', () => {
    expect(messageOf(MoveMemoBodySchema.safeParse(undefined))).toBe('옮길 칸이 올바르지 않습니다.');
  });
});

describe('응답 schema', () => {
  const memo = {
    id: 'a1',
    content: '회의록 작성',
    modelCategory: 'todo',
    finalCategory: 'idea',
    scores: null,
    note: "키워드 '작성' 일치",
    source: 'rule',
    createdAt: '2026-10-05T00:00:00.000Z',
  };

  it('server가 보내는 메모 모양을 받는다', () => {
    expect(MemoSchema.parse(memo)).toEqual(memo);
    const scores = { todo: 0.7, idea: 0.2, check: 0.05, reference: 0.05 };
    expect(MemoSchema.parse({ ...memo, scores, source: 'clef-flash' }).scores).toEqual(scores);
  });

  it('적중 집계는 두 출처를 모두 가진다', () => {
    expect(
      HitStatsSchema.parse({ rule: { hit: 1, total: 2 }, 'clef-flash': { hit: 0, total: 0 } }),
    ).toEqual({ rule: { hit: 1, total: 2 }, 'clef-flash': { hit: 0, total: 0 } });
    expect(HitStatsSchema.safeParse({ rule: { hit: 1, total: 2 } }).success).toBe(false);
  });
});
```

- [ ] **Step 3: 실패 확인**

Run: `pnpm -F @memo/shared test`
Expected: FAIL — `../src`를 찾을 수 없다는 오류

- [ ] **Step 4: `packages/shared/src/memo.ts` 작성**

```ts
import { z } from 'zod';

export const CATEGORIES = ['todo', 'idea', 'check', 'reference'] as const;
export const CategorySchema = z.enum(CATEGORIES, { error: '옮길 칸이 올바르지 않습니다.' });
export type Category = z.infer<typeof CategorySchema>;

export const CLASSIFIER_SOURCES = ['rule', 'clef-flash'] as const;
export const ClassifierSourceSchema = z.enum(CLASSIFIER_SOURCES);
export type ClassifierSource = z.infer<typeof ClassifierSourceSchema>;

export const MAX_CONTENT_LENGTH = 200;

/** 앞뒤 공백을 지운 뒤 1자 이상, 200자 이하. code point 기준으로 센다(Postgres VARCHAR(200)과 같은 기준). */
export const MemoContentSchema = z
  .string({ error: '메모를 입력해 주세요.' })
  .trim()
  .min(1, { error: '메모를 입력해 주세요.' })
  .refine((content) => [...content].length <= MAX_CONTENT_LENGTH, {
    error: `메모는 ${MAX_CONTENT_LENGTH}자 이하로 입력해 주세요.`,
  });

export const CreateMemoBodySchema = z.object(
  { content: MemoContentSchema },
  { error: '메모를 입력해 주세요.' },
);
export type CreateMemoBody = z.infer<typeof CreateMemoBodySchema>;

export const MoveMemoBodySchema = z.object(
  { category: CategorySchema },
  { error: '옮길 칸이 올바르지 않습니다.' },
);
export type MoveMemoBody = z.infer<typeof MoveMemoBodySchema>;

/** 칸별 확률. Clef-flash 분류 결과에만 있다. */
export const ScoresSchema = z.record(CategorySchema, z.number());

export const MemoSchema = z.object({
  id: z.string(),
  content: z.string(),
  modelCategory: CategorySchema,
  finalCategory: CategorySchema,
  scores: ScoresSchema.nullable(),
  note: z.string().nullable(),
  source: ClassifierSourceSchema,
  createdAt: z.string(),
});
export type Memo = z.infer<typeof MemoSchema>;

export const HitCountSchema = z.object({ hit: z.number().int(), total: z.number().int() });
export type HitCount = z.infer<typeof HitCountSchema>;

export const HitStatsSchema = z.object({ rule: HitCountSchema, 'clef-flash': HitCountSchema });
export type HitStats = z.infer<typeof HitStatsSchema>;

export const MemoListResponseSchema = z.object({
  memos: z.array(MemoSchema),
  stats: HitStatsSchema,
});
export type MemoListResponse = z.infer<typeof MemoListResponseSchema>;
```

`packages/shared/src/index.ts`:

```ts
export * from './memo';
```

- [ ] **Step 5: 통과 확인과 build**

Run: `pnpm -F @memo/shared test && pnpm -F @memo/shared typecheck && pnpm build:shared && ls packages/shared/dist`
Expected: 테스트 모두 통과, typecheck exit 0, `index.cjs index.d.cts index.d.ts index.js`

- [ ] **Step 6: Commit**

```bash
git add packages/shared package.json pnpm-lock.yaml pnpm-workspace.yaml
git commit -m "✨ feat: 메모 API 계약을 담은 @memo/shared zod schema 추가"
```

---

### Task 3: server를 공유 schema로 전환

**Files:**
- Modify: `server/package.json`(의존성 2개), `server/src/classifier/category.ts`, `server/src/memos/memos.controller.ts`, `server/src/memos/memo.dto.ts`, `server/src/memos/memo-stats.ts`, `server/src/memos/memos.service.ts`
- Create: `server/src/common/parse-with.ts`
- Test: `server/src/common/parse-with.spec.ts`
- Delete: `server/src/memos/memo-input.ts`, `server/src/memos/memo-input.spec.ts`(같은 규칙을 Task 2의 shared 테스트가 검사한다)

**Interfaces:**
- Consumes: Task 2의 `CreateMemoBodySchema`, `MoveMemoBodySchema`, `type Category`, `type ClassifierSource`, `type Memo`, `type HitStats`
- Produces: `parseWith<T extends z.ZodType>(schema: T, raw: unknown): z.infer<T>` — 실패 시 첫 issue 문구로 `BadRequestException`. `memo.dto.ts`는 `MemoDto`(= shared `Memo`)와 `toMemoDto`를, `memo-stats.ts`는 `computeHitStats`와 `HitStats`(re-export)를 계속 export한다.

- [ ] **Step 1: 의존성 추가**

Run: `pnpm -F server add "@memo/shared@workspace:*" zod@4.6.5 && pnpm build:shared`
Expected: `server/package.json`의 `dependencies`에 `"@memo/shared": "workspace:*"`, `"zod": "4.6.5"`

- [ ] **Step 2: 실패하는 테스트 작성 — `server/src/common/parse-with.spec.ts`**

```ts
import { BadRequestException } from '@nestjs/common';
import { CreateMemoBodySchema, MoveMemoBodySchema } from '@memo/shared';
import { parseWith } from './parse-with';

describe('parseWith', () => {
  it('통과하면 schema가 변환한 값을 돌려준다', () => {
    expect(parseWith(CreateMemoBodySchema, { content: '  회의록 작성 ' })).toEqual({
      content: '회의록 작성',
    });
  });

  it('실패하면 첫 오류 문구로 BadRequestException을 던진다', () => {
    expect(() => parseWith(CreateMemoBodySchema, { content: ' ' })).toThrow(
      new BadRequestException('메모를 입력해 주세요.'),
    );
    expect(() => parseWith(MoveMemoBodySchema, { category: '할 일' })).toThrow(
      new BadRequestException('옮길 칸이 올바르지 않습니다.'),
    );
  });
});
```

Run: `pnpm -F server exec jest src/common`
Expected: FAIL — `Cannot find module './parse-with'`

- [ ] **Step 3: `server/src/common/parse-with.ts` 작성**

```ts
import { BadRequestException } from '@nestjs/common';
import type { z } from 'zod';

/** 요청 body를 shared schema로 검사한다. 실패하면 schema에 적힌 첫 번째 한국어 문구로 400을 던진다. */
export function parseWith<T extends z.ZodType>(schema: T, raw: unknown): z.infer<T> {
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new BadRequestException(
      result.error.issues[0]?.message ?? '요청이 올바르지 않습니다.',
    );
  }
  return result.data;
}
```

Run: `pnpm -F server exec jest src/common`
Expected: PASS (2 tests)

- [ ] **Step 4: 타입 정의를 shared로 교체**

`server/src/classifier/category.ts` 전체 교체:

```ts
import type { Category, ClassifierSource } from '@memo/shared';

export type { Category, ClassifierSource } from '@memo/shared';

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

`server/src/memos/memo-stats.ts` 전체 교체:

```ts
import type { HitStats } from '@memo/shared';

export type { HitCount, HitStats } from '@memo/shared';

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

`server/src/memos/memo.dto.ts` 전체 교체:

```ts
import type { Category, ClassifierSource, Memo } from '@memo/shared';
import type { Memo as PrismaMemo } from '@prisma/client';

/** 응답 모양은 @memo/shared의 MemoSchema가 정한다. */
export type MemoDto = Memo;

/** DB에는 server만 쓰고, 쓸 때 shared schema와 분류기 결과로 값을 검사하므로 여기서는 형만 맞춘다. */
export function toMemoDto(memo: PrismaMemo): MemoDto {
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

`server/src/memos/memos.service.ts`의 import 두 줄을 교체한다(나머지는 그대로):

```ts
import { computeHitStats, HitStats } from './memo-stats';
```
→
```ts
import { computeHitStats, type HitStats } from './memo-stats';
```

- [ ] **Step 5: controller를 `parseWith`로 교체**

`server/src/memos/memos.controller.ts` 전체 교체:

```ts
import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { CreateMemoBodySchema, MoveMemoBodySchema } from '@memo/shared';
import { parseWith } from '../common/parse-with';
import { MemosService } from './memos.service';

@Controller('memos')
export class MemosController {
  constructor(private readonly memos: MemosService) {}

  @Get()
  list() {
    return this.memos.list();
  }

  @Post()
  create(@Body() body: unknown) {
    const { content } = parseWith(CreateMemoBodySchema, body);
    return this.memos.create(content);
  }

  @Patch(':id')
  move(@Param('id') id: string, @Body() body: unknown) {
    const { category } = parseWith(MoveMemoBodySchema, body);
    return this.memos.move(id, category);
  }
}
```

```bash
git rm server/src/memos/memo-input.ts server/src/memos/memo-input.spec.ts
```

- [ ] **Step 6: 전체 확인**

Run: `pnpm -F server exec prettier --write src && pnpm -F server test && pnpm test:e2e && pnpm -F server build && pnpm -F server exec eslint src test/memos.e2e-spec.ts test/server-error.e2e-spec.ts`
Expected: 단위 테스트 통과(규칙 분류기 7, 적중 집계 3, parseWith 2 = 12), **e2e 11개를 파일 수정 없이 통과**, build·lint exit 0
Run: `git diff --stat HEAD -- server/test`
Expected: 출력 없음(e2e 파일 무수정)

- [ ] **Step 7: Commit**

```bash
git add server pnpm-lock.yaml
git commit -m "♻️ refactor: server 입력 검사와 응답 타입을 공유 schema로 전환"
```

---

### Task 4: web을 공유 schema로 전환

**Files:**
- Modify: `web/package.json`(의존성 1개), `web/src/api.ts`(타입·상수 선언 부분), `web/src/components/MemoInput.tsx`

**Interfaces:**
- Consumes: Task 2의 `CATEGORIES`, `MAX_CONTENT_LENGTH`, `type Category`, `type ClassifierSource`, `type Memo`, `type HitCount`, `type HitStats`
- Produces: `web/src/api.ts`가 기존과 같은 이름(`CATEGORIES`, `Category`, `ClassifierSource`, `Memo`, `HitCount`, `HitStats`, `CATEGORY_LABELS`, `SOURCE_LABELS`, `fetchMemos`, `createMemo`, `moveMemo`)을 계속 export한다. component는 수정하지 않는다(MemoInput 제외).

- [ ] **Step 1: 의존성 추가**

Run: `pnpm -F web add "@memo/shared@workspace:*" && pnpm build:shared`

- [ ] **Step 2: `web/src/api.ts`의 맨 위부터 `HitStats` 선언까지를 교체**

교체 전 범위: 파일 첫 줄 `export const CATEGORIES = …`부터 `export type HitStats = Record<ClassifierSource, HitCount>;`까지. 교체 후:

```ts
import type { Category, ClassifierSource, HitStats, Memo } from '@memo/shared';

export { CATEGORIES } from '@memo/shared';
export type { Category, ClassifierSource, HitCount, HitStats, Memo } from '@memo/shared';

export const CATEGORY_LABELS: Record<Category, string> = {
  todo: '할 일',
  idea: '아이디어',
  check: '확인할 것',
  reference: '참고',
};

export const SOURCE_LABELS: Record<ClassifierSource, string> = {
  rule: '규칙',
  'clef-flash': 'Clef-flash',
};
```

`SERVER_DOWN_MESSAGE`부터 파일 끝(`request`, `fetchMemos`, `createMemo`, `moveMemo`)은 그대로 둔다.

- [ ] **Step 3: `web/src/components/MemoInput.tsx`의 글자 수 상한을 shared 값으로 교체**

`const MAX_LENGTH = 200;`을 지우고 import를 추가한 뒤, 파일 안의 `MAX_LENGTH`를 모두 `MAX_CONTENT_LENGTH`로 바꾼다.

```ts
import { MAX_CONTENT_LENGTH } from '@memo/shared';
```

- [ ] **Step 4: 확인**

Run: `pnpm -F web build && pnpm -F web lint`
Expected: build exit 0, lint는 기존 경고 1건만

Run: `grep -rnE "\['todo', 'idea', 'check', 'reference'\]|'rule' \| 'clef-flash'|interface Memo\b|HitCount = \{" server/src web/src packages/shared/src`
Expected: `packages/shared/src/memo.ts`의 `CATEGORIES` 한 줄만 나온다.

- [ ] **Step 5: Commit**

```bash
git add web pnpm-lock.yaml
git commit -m "♻️ refactor: web API 타입과 글자 수 상한을 공유 schema로 전환"
```

---

### Task 5: Docker를 pnpm workspace 기준으로 전환

**Files:**
- Modify: `server/Dockerfile`, `docker-compose.yml`(server 서비스)
- Create: `.dockerignore`(루트)
- Delete: `server/.dockerignore`(build 범위가 루트로 바뀌어 더는 쓰이지 않음)

**Interfaces:**
- Produces: worktree 루트에서 `docker compose up -d --build`로 server(3000)·db(5433)가 뜨고, `server/src` 수정이 컨테이너에 반영된다.

- [ ] **Step 1: 루트 `.dockerignore` 작성**

```
**/node_modules
**/dist
**/.env
.git
.claude
.superpowers
```

- [ ] **Step 2: `server/Dockerfile` 전체 교체**

```dockerfile
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
```

- [ ] **Step 3: `docker-compose.yml`의 server 서비스 교체 (db는 그대로)**

```yaml
  server:
    build:
      context: .
      dockerfile: server/Dockerfile
    environment:
      DATABASE_URL: postgresql://memo:memo@db:5432/memo
    ports:
      - "3000:3000"
    depends_on:
      db:
        condition: service_healthy
    volumes:
      # server 코드 수정은 바로 반영된다. shared·schema.prisma·의존성을 바꾸면 --build로 다시 띄운다.
      - ./server/src:/app/server/src
      - ./server/prisma:/app/server/prisma
```

```bash
git rm server/.dockerignore
```

- [ ] **Step 4: 처음부터 build해서 확인**

```bash
docker compose down -v
docker compose up -d --build
```

Run (server가 뜰 때까지 기다린 뒤): `curl -s localhost:3000/api/memos`
Expected: `{"memos":[],"stats":{"rule":{"hit":0,"total":0},"clef-flash":{"hit":0,"total":0}}}`(키 순서는 상관없음)

Run: `curl -s -X POST localhost:3000/api/memos -H 'Content-Type: application/json' -d '{"content":"   "}'`
Expected: `"message":"메모를 입력해 주세요."`와 `"statusCode":400`

Run: `curl -s -X POST localhost:3000/api/memos -H 'Content-Type: application/json' -d '{"content":"배포 일정 확인"}'`
Expected: `"modelCategory":"check"`

- [ ] **Step 5: 코드 수정 뒤 프로세스가 하나만 남는지 확인**

`server/src/app.setup.ts` 끝에 빈 줄을 추가해 저장하고 10초 기다린 뒤, 빈 줄을 지우고 다시 10초 기다린다(편집기나 `printf`로 되돌린다. **`git checkout`으로 되돌리지 않는다**).
Run: `docker compose exec -T server sh -c 'ps -eo pid,args | grep "dist/main" | grep -v grep'`
Expected: `node --enable-source-maps /app/server/dist/main` 프로세스가 하나만 있다(`sh -c` 줄 1개와 `node` 줄 1개).

- [ ] **Step 6: Commit**

```bash
git add .dockerignore server/Dockerfile docker-compose.yml
git commit -m "🐳 chore: Docker build를 pnpm workspace 기준으로 전환"
```

---

### Task 6: 실행 안내 갱신과 처음부터 확인

**Files:**
- Modify: `README.md`, `HANDOFF.md`(실행 명령이 나오는 곳만)

- [ ] **Step 1: `README.md`의 「실행」부터 끝까지를 교체**

````markdown
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
| `package.json`(의존성) | `pnpm install` 후 `docker compose up -d --build server` |
````

- [ ] **Step 2: `HANDOFF.md`에서 `npm run`·`npm install`로 적힌 실행 안내가 있으면 pnpm 명령으로 고친다**

Run: `grep -n "npm run\|npm install\|npm ci" HANDOFF.md README.md`
Expected: 결정 기록(과거 사실)을 설명하는 줄 외에는 나오지 않는다.

- [ ] **Step 3: README 순서대로 처음부터 확인 (Review Focus 2)**

```bash
rm -rf node_modules packages/*/node_modules packages/*/dist server/node_modules server/dist web/node_modules web/dist   # .env는 남긴다
pnpm install
pnpm build:shared
pnpm test
pnpm -F server test:e2e:prepare
pnpm test:e2e
pnpm -F web build
```

Expected: 모두 exit 0, e2e 11개 통과

- [ ] **Step 4: 화면 확인**

`docker compose up -d`와 `pnpm dev:web`을 띄우고 `http://localhost:5173`에서 확인한다: 메모 입력 → 칸 배치, 칸 이동 → `처음 분류` 표시와 적중 변화, 공백·201자 입력 시 버튼 비활성.

- [ ] **Step 5: Commit**

```bash
git add README.md HANDOFF.md
git commit -m "📝 docs: 실행·테스트 안내를 pnpm workspace 기준으로 수정"
```
