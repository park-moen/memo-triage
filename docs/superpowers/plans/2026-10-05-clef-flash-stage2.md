# 2단계: Clef-flash 분류기 연결 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **사람이 읽을 부분:** Goal부터 Review Focus까지와, 각 Task 제목 아래의 **Files**·**Interfaces**만 보면 된다. 나머지 코드 블록은 구현 subagent가 그대로 옮겨 쓰는 내용이다.

**Goal:** server가 메모를 Clef-flash로 분류하고(메모당 최대 3번, 하루 상한, 실패 시 규칙 대체), 화면에 칸별 확률과 판단 출처(Clef-flash·대체 규칙·규칙)를 보여 준다.

**Architecture:** 계약은 `@memo/shared`부터 바꾼다(`fallbackReason`, `HitStatsSchema`). server는 조합 구조다: `ClefClassifier`(HTTP 호출 1번·응답 해석)와 `PrismaClefCallLog`(`clef_calls` 기록·오늘 UTC 호출 수)를 `ResilientClassifier`(토큰 확인·상한·재시도·규칙 대체)가 감싸고, 이것을 기존 `CLASSIFIER` 토큰에 꽂는다. `MemosService`·controller·API는 바뀌지 않는다.

**Tech Stack:** 기존과 같음(pnpm 12.4.1 workspace, NestJS 11, Prisma 6.19.3, zod 4.6.5, tsup, vitest, Jest, React + Vite, Docker Compose). Node 24 내장 `fetch`·`AbortController`.

**Spec:** `docs/superpowers/specs/2026-10-05-clef-flash-stage2-design.md` (기준 문서: `docs/superpowers/specs/2026-10-04-memo-classifier-design.md`, `docs/superpowers/specs/2026-10-05-shared-schema-design.md`)

## Global Constraints

- **agent가 실행하는 테스트는 실제 Cloudflare를 부르지 않는다.** 단위 테스트는 가짜 `fetch`·가짜 기록을 쓰고, e2e는 `server/test/setup-env.ts`에서 `CLOUDFLARE_ACCOUNT_ID`·`CLOUDFLARE_API_TOKEN`을 빈 문자열로 둔다. 실제 호출은 Task 7의 최종 확인에서만, **합계 5번 이내**로 한다.
- 토큰 값을 출력·기록·commit하지 않는다. `server/.env`는 commit하지 않는다. `server/.env.example`에는 빈 값만 둔다.
- 기존 e2e 파일(`server/test/memos.e2e-spec.ts`, `server/test/server-error.e2e-spec.ts`)은 수정하지 않고 통과해야 한다.
- 정확한 값: 모델 `@cf/cloudflare/clef-flash`, URL `https://api.cloudflare.com/client/v4/accounts/{CLOUDFLARE_ACCOUNT_ID}/ai/run/@cf/cloudflare/clef-flash`, 시간 제한 5000ms, 최대 시도 3번, `CLEF_DAILY_LIMIT` 기본 100, 하루 기준 UTC 자정.
- `FALLBACK_REASONS` = `timeout`, `network`, `invalid_response`, `auth`, `rate_limited`, `daily_limit`, `not_configured`. `clef_calls.outcome` = `success`, `timeout`, `network`, `invalid_response`, `auth`, `rate_limited`.
- 재시도: `timeout`·`network`·`invalid_response`는 재시도, `auth`·`rate_limited`는 재시도하지 않는다. HTTP 401·403=`auth`, 429=`rate_limited`, 5xx·연결 실패=`network`, 그 밖 4xx·`success: false`·모양 오류=`invalid_response`.
- 화면 문구: 배지 `Clef-flash`·`대체 규칙`·`규칙`, 대기 카드 "분류 중… (최대 15초)". 대체 이유 문구는 web `FALLBACK_LABELS`(Task 6)의 값을 그대로 쓴다.
- shared를 고친 뒤에는 `pnpm build:shared`를 다시 실행해야 server·web이 새 타입을 본다.
- Docker stack은 한 번에 한 폴더에서만 띄운다. 무관한 `ieve-mariadb` 컨테이너는 건드리지 않는다.
- commit은 local만 하고, 제목은 `<emoji> <type>: <한국어 제목>`으로 동작 명사로 끝낸다. 본문은 존댓말. push는 하지 않는다.

## Review Focus

1. 실제 토큰이 있는 상태에서 e2e를 돌려도 Cloudflare를 부르지 않아야 한다(`.env` 값이 테스트에 새지 않음) → Task 5 e2e가 가짜 `fetch` 호출 수와 `clef_calls`로 확인
2. 응답 본문이 JSON이 아니거나 `probabilities`의 칸이 하나 빠진 200 응답 → `invalid_response`로 재시도, 500이 아님 → Task 3 테스트
3. 시도 도중에 하루 상한에 닿으면 남은 시도를 하지 않고 `daily_limit`로 대체 → Task 4 테스트
4. `CLEF_DAILY_LIMIT`가 비어 있거나 숫자가 아닐 때 기본 100, `0`이면 호출하지 않음 → Task 3·4 테스트
5. 1단계에 저장된 규칙 메모(`fallback_reason` null)는 계속 `규칙` 배지 → Task 6 화면 확인, Task 2 e2e 무수정 통과
6. e2e 파일끼리 같은 `memo_test` DB를 비우므로 병렬 실행 시 서로 데이터를 지운다 → Task 5에서 `--runInBand`

---

### Task 0: worktree 준비 (controller가 직접 실행)

**Files:** `docs/superpowers/specs/2026-10-05-clef-flash-stage2-design.md`, 이 계획 파일, `HANDOFF.md`, `server/.env.example` (모두 `main` 폴더에 commit 전으로 있음)

- [ ] **Step 1:** `orca worktree create --repo id:324cc2ea-3719-4495-9265-ac25393978f3 --name clef-flash-stage2 --no-parent --setup skip --json`으로 Orca worktree를 만들고, branch 이름을 `feat/clef-flash-classifier`로 바꾼다(`git branch -m`).
- [ ] **Step 2:** `main` 폴더의 위 4개 파일을 worktree로 복사하고, `main` 폴더에서는 HANDOFF.md·`.env.example`을 commit된 상태로 되돌리고 새 문서 2개를 지운다. `server/.env`(토큰 포함, commit 안 함)를 worktree로 복사한다.
- [ ] **Step 3:** `main` 폴더 Docker stack을 내린다(`docker compose down`, volume 유지).
- [ ] **Step 4:** worktree에서 commit

```bash
git add HANDOFF.md server/.env.example docs/superpowers/specs/2026-10-05-clef-flash-stage2-design.md docs/superpowers/plans/2026-10-05-clef-flash-stage2.md
git commit -m "📝 docs: Clef-flash 연결 설계와 구현 계획 추가"
```

- [ ] **Step 5:** worktree에서 `pnpm install && pnpm build:shared && pnpm -F server exec prisma generate && docker compose up -d db`
- [ ] **Step 6:** worktree 카드 터미널에 새 Claude 세션을 띄우고 Task 1부터 subagent-driven으로 진행하도록 넘긴다.

---

### Task 1: 공유 계약에 대체 사유와 출처 기반 적중 집계 추가

**Files:**
- Modify: `packages/shared/src/memo.ts`
- Modify: `packages/shared/test/memo.test.ts`

**Interfaces:**
- Produces: `FALLBACK_REASONS: readonly ['timeout','network','invalid_response','auth','rate_limited','daily_limit','not_configured']`, `FallbackReasonSchema`, `type FallbackReason`, `isClassifierSource(value: unknown): value is ClassifierSource`, `MemoSchema`에 `fallbackReason: FallbackReason | null`, `HitStatsSchema`(키 = `CLASSIFIER_SOURCES`)

- [ ] **Step 1: 실패하는 테스트 작성** — `packages/shared/test/memo.test.ts`

import 목록에 `FALLBACK_REASONS`, `FallbackReasonSchema`, `isClassifierSource`를 추가하고, `응답 schema` describe 안의 `memo` 객체에 `fallbackReason: null,`을 `source: 'rule',` 다음 줄에 넣는다. 그리고 파일 끝에 아래를 추가한다.

```ts
describe('대체 사유', () => {
  it('7개 코드를 정해진 순서로 가진다', () => {
    expect(FALLBACK_REASONS).toEqual([
      'timeout',
      'network',
      'invalid_response',
      'auth',
      'rate_limited',
      'daily_limit',
      'not_configured',
    ]);
  });

  it('정해진 코드만 받는다', () => {
    expect(FallbackReasonSchema.safeParse('timeout').success).toBe(true);
    expect(FallbackReasonSchema.safeParse('unknown').success).toBe(false);
  });

  it('메모는 fallbackReason으로 대체 이유를 담고, 없으면 null이다', () => {
    const fallback = {
      id: 'b2',
      content: '회의록 작성',
      modelCategory: 'todo',
      finalCategory: 'todo',
      scores: null,
      note: "키워드 '작성' 일치",
      source: 'rule',
      fallbackReason: 'timeout',
      createdAt: '2026-10-05T00:00:00.000Z',
    };
    expect(MemoSchema.parse(fallback).fallbackReason).toBe('timeout');
    expect(MemoSchema.safeParse({ ...fallback, fallbackReason: 'oops' }).success).toBe(false);
    const { fallbackReason: _omit, ...withoutField } = fallback;
    expect(MemoSchema.safeParse(withoutField).success).toBe(false);
  });
});

describe('출처', () => {
  it('isClassifierSource는 CLASSIFIER_SOURCES의 값만 참이다', () => {
    expect(isClassifierSource('rule')).toBe(true);
    expect(isClassifierSource('clef-flash')).toBe(true);
    expect(isClassifierSource('unknown')).toBe(false);
    expect(isClassifierSource(1)).toBe(false);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm -F @memo/shared test`
Expected: FAIL — `FALLBACK_REASONS`·`isClassifierSource`가 export되지 않음, `fallbackReason`이 있는 `memo`가 통과하지 못함

- [ ] **Step 3: `packages/shared/src/memo.ts` 수정**

`ClassifierSource` 타입 선언 바로 아래에 추가:

```ts
export function isClassifierSource(value: unknown): value is ClassifierSource {
  return (CLASSIFIER_SOURCES as readonly unknown[]).includes(value);
}

/** Clef-flash 대신 규칙 분류기로 분류한 이유. 1단계에서 규칙으로 분류한 메모는 null이다. */
export const FALLBACK_REASONS = [
  'timeout',
  'network',
  'invalid_response',
  'auth',
  'rate_limited',
  'daily_limit',
  'not_configured',
] as const;
export const FallbackReasonSchema = z.enum(FALLBACK_REASONS);
export type FallbackReason = z.infer<typeof FallbackReasonSchema>;
```

`MemoSchema`의 `source: ClassifierSourceSchema,` 다음 줄에 추가:

```ts
  fallbackReason: FallbackReasonSchema.nullable(),
```

`HitStatsSchema` 선언을 아래로 교체:

```ts
export const HitStatsSchema = z.object(
  Object.fromEntries(CLASSIFIER_SOURCES.map((source) => [source, HitCountSchema])) as Record<
    ClassifierSource,
    typeof HitCountSchema
  >,
);
```

- [ ] **Step 4: 통과 확인과 build**

Run: `pnpm -F @memo/shared test && pnpm -F @memo/shared typecheck && pnpm build:shared`
Expected: 모든 테스트 PASS, typecheck exit 0, build 성공

- [ ] **Step 5: Commit**

```bash
git add packages/shared
git commit -m "✨ feat: 공유 계약에 대체 사유와 출처 기반 적중 집계 추가"
```

---

### Task 2: DB와 server 데이터 경로에 fallbackReason 연결

**Files:**
- Modify: `server/prisma/schema.prisma`
- Create: `server/prisma/migrations/<타임스탬프>_clef_flash/migration.sql` (Prisma가 생성)
- Modify: `server/src/classifier/category.ts`, `server/src/classifier/rule-classifier.ts`, `server/src/classifier/rule-classifier.spec.ts`
- Modify: `server/src/memos/memos.service.ts`, `server/src/memos/memo.dto.ts`, `server/src/memos/memo-stats.ts`, `server/src/memos/memo-stats.spec.ts`

**Interfaces:**
- Consumes: Task 1의 `FallbackReason`, `CLASSIFIER_SOURCES`, `isClassifierSource`
- Produces: Prisma 모델 `Memo.fallbackReason: string | null`(열 `fallback_reason`), 새 모델 `ClefCall { id, createdAt, outcome }`(테이블 `clef_calls`), `ClassifyResult.fallbackReason: FallbackReason | null`, `category.ts`가 `FallbackReason` 타입을 re-export

- [ ] **Step 1: 실패하는 테스트로 기대값 갱신**

`server/src/classifier/rule-classifier.spec.ts`의 `it.each` 기대 객체에 `fallbackReason: null,`을 `note,` 다음 줄에 넣는다:

```ts
    expect(classifyByRules(content)).toEqual({
      category,
      source: 'rule',
      scores: null,
      note,
      fallbackReason: null,
    });
```

`server/src/memos/memo-stats.spec.ts`의 마지막 테스트 아래에 추가:

```ts
  it('CLASSIFIER_SOURCES의 모든 출처를 0으로 시작한다', () => {
    expect(Object.keys(computeHitStats([])).sort()).toEqual(['clef-flash', 'rule']);
  });
```

Run: `pnpm -F server exec jest src/classifier src/memos`
Expected: FAIL — `classifyByRules` 결과에 `fallbackReason`이 없음

- [ ] **Step 2: `server/prisma/schema.prisma` 수정**

`Memo` 모델의 `source        String` 다음 줄에 추가:

```prisma
  fallbackReason String?  @map("fallback_reason")
```

파일 끝에 추가:

```prisma
/// Cloudflare에 실제로 요청을 보낸 기록. 하루 호출 수(UTC)를 셀 때 쓴다.
model ClefCall {
  id        String   @id @default(uuid())
  createdAt DateTime @default(now()) @map("created_at")
  outcome   String

  @@index([createdAt])
  @@map("clef_calls")
}
```

Run: `pnpm -F server exec prisma migrate dev --name clef_flash`
Expected: `server/prisma/migrations/<타임스탬프>_clef_flash/migration.sql` 생성, `Your database is now in sync with your schema.`, Prisma Client 생성

- [ ] **Step 3: `server/src/classifier/category.ts` 전체 교체**

```ts
import type { Category, ClassifierSource, FallbackReason } from '@memo/shared';

export type { Category, ClassifierSource, FallbackReason } from '@memo/shared';

export interface ClassifyResult {
  category: Category;
  source: ClassifierSource;
  /** 칸별 확률. Clef-flash만 채운다. */
  scores: Record<Category, number> | null;
  /** 규칙 분류기의 근거(일치한 키워드). Clef-flash 결과는 null이다. */
  note: string | null;
  /** Clef-flash 대신 규칙으로 분류한 이유. 대체가 아니면 null이다. */
  fallbackReason: FallbackReason | null;
}

export interface Classifier {
  classify(content: string): Promise<ClassifyResult>;
}

export const CLASSIFIER = Symbol('CLASSIFIER');
```

- [ ] **Step 4: `server/src/classifier/rule-classifier.ts`의 두 반환 객체에 `fallbackReason: null,` 추가**

```ts
      return {
        category: rule.category,
        source: 'rule',
        scores: null,
        note: `키워드 '${matched}' 일치`,
        fallbackReason: null,
      };
```

```ts
  return {
    category: 'reference',
    source: 'rule',
    scores: null,
    note: '일치한 키워드 없음',
    fallbackReason: null,
  };
```

- [ ] **Step 5: 저장·응답·집계 경로 수정**

`server/src/memos/memos.service.ts`의 `create`에서 `source: result.source,` 다음 줄에 추가:

```ts
        fallbackReason: result.fallbackReason,
```

`server/src/memos/memo.dto.ts`를 아래로 교체:

```ts
import type { Category, ClassifierSource, FallbackReason, Memo } from '@memo/shared';
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
    fallbackReason: memo.fallbackReason as FallbackReason | null,
    createdAt: memo.createdAt.toISOString(),
  };
}
```

`server/src/memos/memo-stats.ts`를 아래로 교체:

```ts
import { CLASSIFIER_SOURCES, isClassifierSource, type HitStats } from '@memo/shared';

export type { HitCount, HitStats } from '@memo/shared';

export function computeHitStats(
  memos: ReadonlyArray<{
    source: string;
    modelCategory: string;
    finalCategory: string;
  }>,
): HitStats {
  const stats = Object.fromEntries(
    CLASSIFIER_SOURCES.map((source) => [source, { hit: 0, total: 0 }]),
  ) as HitStats;
  for (const memo of memos) {
    if (!isClassifierSource(memo.source)) continue;
    const count = stats[memo.source];
    count.total += 1;
    if (memo.modelCategory === memo.finalCategory) count.hit += 1;
  }
  return stats;
}
```

- [ ] **Step 6: 확인**

Run: `pnpm -F server exec prettier --write src && pnpm -F server test && pnpm -F server test:e2e:prepare && pnpm test:e2e && pnpm -F server build && pnpm -F server exec eslint src`
Expected: 단위 테스트 모두 PASS, **기존 e2e 11개 PASS(파일 무수정)**, build·lint exit 0

- [ ] **Step 7: Commit**

```bash
git add server/prisma server/src
git commit -m "🗃️ db: 메모 대체 사유 열과 Clef-flash 호출 기록 테이블 추가"
```

---

### Task 3: Clef-flash 설정과 호출 1번을 맡는 ClefClassifier

**Files:**
- Create: `server/src/classifier/clef/clef-config.ts`, `server/src/classifier/clef/clef-config.spec.ts`
- Create: `server/src/classifier/clef/clef-classifier.ts`, `server/src/classifier/clef/clef-classifier.spec.ts`

**Interfaces:**
- Consumes: shared `CategorySchema`, `type Category`, `type FallbackReason`
- Produces:
  - `interface ClefConfig { accountId: string; apiToken: string; dailyLimit: number }`, `CLEF_CONFIG` 토큰, `DEFAULT_DAILY_LIMIT = 100`, `loadClefConfig(env?: Record<string, string | undefined>): ClefConfig`, `isClefConfigured(config: ClefConfig): boolean`
  - `type ClefOutcome = 'success' | ClefFailureReason`, `type ClefFailureReason = 'timeout' | 'network' | 'invalid_response' | 'auth' | 'rate_limited'`
  - `type ClefCallResult = { ok: true; category: Category; scores: Record<Category, number> } | { ok: false; reason: ClefFailureReason; retryable: boolean }`
  - `type FetchLike = (url: string, init: RequestInit) => Promise<Response>`, `CLEF_FETCH` 토큰, `CLEF_TIMEOUT_MS = 5000`
  - `class ClefClassifier { constructor(config: ClefConfig, fetchFn: FetchLike, timeoutMs?: number); classifyOnce(content: string): Promise<ClefCallResult> }`

- [ ] **Step 1: 실패하는 테스트 작성 — `server/src/classifier/clef/clef-config.spec.ts`**

```ts
import { DEFAULT_DAILY_LIMIT, isClefConfigured, loadClefConfig } from './clef-config';

describe('loadClefConfig', () => {
  it('환경 변수에서 값을 읽고 앞뒤 공백을 지운다', () => {
    expect(
      loadClefConfig({
        CLOUDFLARE_ACCOUNT_ID: ' acc ',
        CLOUDFLARE_API_TOKEN: ' tok ',
        CLEF_DAILY_LIMIT: '7',
      }),
    ).toEqual({ accountId: 'acc', apiToken: 'tok', dailyLimit: 7 });
  });

  it.each([[undefined], [''], ['abc'], ['-1'], ['1.5']])(
    'CLEF_DAILY_LIMIT %j는 기본값을 쓴다',
    (value) => {
      expect(loadClefConfig({ CLEF_DAILY_LIMIT: value }).dailyLimit).toBe(DEFAULT_DAILY_LIMIT);
    },
  );

  it('CLEF_DAILY_LIMIT 0은 그대로 0이다', () => {
    expect(loadClefConfig({ CLEF_DAILY_LIMIT: '0' }).dailyLimit).toBe(0);
  });

  it('계정 ID와 토큰이 모두 있어야 설정된 것이다', () => {
    expect(isClefConfigured(loadClefConfig({ CLOUDFLARE_ACCOUNT_ID: 'a', CLOUDFLARE_API_TOKEN: 't' }))).toBe(true);
    expect(isClefConfigured(loadClefConfig({ CLOUDFLARE_ACCOUNT_ID: 'a', CLOUDFLARE_API_TOKEN: '' }))).toBe(false);
    expect(isClefConfigured(loadClefConfig({}))).toBe(false);
  });
});
```

- [ ] **Step 2: 실패하는 테스트 작성 — `server/src/classifier/clef/clef-classifier.spec.ts`**

```ts
import { ClefClassifier, type FetchLike } from './clef-classifier';
import type { ClefConfig } from './clef-config';

const config: ClefConfig = { accountId: 'acc-1', apiToken: 'tok-1', dailyLimit: 100 };

const okBody = {
  result: {
    model: 'clef-flash',
    answers: {
      category: {
        type: 'choice',
        choice: 'check',
        probabilities: { todo: 0.1477, idea: 0.0151, check: 0.7676, reference: 0.0696 },
        confidence: 0.488,
      },
    },
    usage: { input_tokens: 194, output_tokens: 0 },
  },
  success: true,
  errors: [],
  messages: [],
};

function respond(status: number, body: unknown): FetchLike {
  return () =>
    Promise.resolve(
      new Response(typeof body === 'string' ? body : JSON.stringify(body), { status }),
    );
}

describe('ClefClassifier.classifyOnce', () => {
  it('성공하면 choice를 칸으로, probabilities를 scores로 돌려준다', async () => {
    const result = await new ClefClassifier(config, respond(200, okBody)).classifyOnce('배포 일정 PM한테 확인');
    expect(result).toEqual({
      ok: true,
      category: 'check',
      scores: { todo: 0.1477, idea: 0.0151, check: 0.7676, reference: 0.0696 },
    });
  });

  it('정해진 URL·헤더·본문으로 요청한다', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchFn: FetchLike = (url, init) => {
      calls.push({ url, init });
      return respond(200, okBody)(url, init);
    };
    await new ClefClassifier(config, fetchFn).classifyOnce('회의록 작성');

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(
      'https://api.cloudflare.com/client/v4/accounts/acc-1/ai/run/@cf/cloudflare/clef-flash',
    );
    expect(calls[0].init.method).toBe('POST');
    expect(calls[0].init.headers).toEqual({
      Authorization: 'Bearer tok-1',
      'Content-Type': 'application/json',
    });
    expect(JSON.parse(calls[0].init.body as string)).toEqual({
      state: '회의록 작성',
      questions: {
        category: {
          type: 'choice',
          instructions: '이 메모는 어느 칸에 들어가야 하나요?',
          criteria: {
            todo: '내가 직접 해야 하는 작업',
            idea: '해 볼 만한 생각이나 개선안',
            check: '누군가에게 묻거나 찾아봐야 하는 것',
            reference: '행동 없이 알아만 두면 되는 정보',
          },
        },
      },
    });
  });

  it.each([
    [401, 'auth', false],
    [403, 'auth', false],
    [429, 'rate_limited', false],
    [500, 'network', true],
    [503, 'network', true],
    [400, 'invalid_response', true],
  ])('HTTP %i는 %s(재시도 %s)', async (status, reason, retryable) => {
    const result = await new ClefClassifier(config, respond(status, { success: false })).classifyOnce('메모');
    expect(result).toEqual({ ok: false, reason, retryable });
  });

  it('연결 실패는 network(재시도)', async () => {
    const fetchFn: FetchLike = () => Promise.reject(new TypeError('fetch failed'));
    expect(await new ClefClassifier(config, fetchFn).classifyOnce('메모')).toEqual({
      ok: false,
      reason: 'network',
      retryable: true,
    });
  });

  it('시간 제한을 넘기면 요청을 끊고 timeout(재시도)', async () => {
    const fetchFn: FetchLike = (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      });
    expect(await new ClefClassifier(config, fetchFn, 20).classifyOnce('메모')).toEqual({
      ok: false,
      reason: 'timeout',
      retryable: true,
    });
  });

  it.each([
    ['success가 false', { ...okBody, success: false }],
    ['choice가 4칸이 아님', { ...okBody, result: { answers: { category: { ...okBody.result.answers.category, choice: 'other' } } } }],
    ['probabilities에 칸이 빠짐', { ...okBody, result: { answers: { category: { choice: 'check', probabilities: { check: 1 } } } } }],
    ['본문이 JSON이 아님', 'not json'],
  ])('200이지만 %s이면 invalid_response(재시도)', async (_name, body) => {
    expect(await new ClefClassifier(config, respond(200, body)).classifyOnce('메모')).toEqual({
      ok: false,
      reason: 'invalid_response',
      retryable: true,
    });
  });
});
```

Run: `pnpm -F server exec jest src/classifier/clef`
Expected: FAIL — `Cannot find module './clef-config'`, `Cannot find module './clef-classifier'`

- [ ] **Step 3: `server/src/classifier/clef/clef-config.ts` 작성**

```ts
export interface ClefConfig {
  accountId: string;
  apiToken: string;
  /** 하루(UTC) 최대 호출 수. 0이면 호출하지 않는다. */
  dailyLimit: number;
}

export const CLEF_CONFIG = Symbol('CLEF_CONFIG');
export const DEFAULT_DAILY_LIMIT = 100;

export function loadClefConfig(
  env: Record<string, string | undefined> = process.env,
): ClefConfig {
  const rawLimit = env.CLEF_DAILY_LIMIT?.trim() ?? '';
  const limit = Number(rawLimit);
  return {
    accountId: env.CLOUDFLARE_ACCOUNT_ID?.trim() ?? '',
    apiToken: env.CLOUDFLARE_API_TOKEN?.trim() ?? '',
    dailyLimit:
      rawLimit !== '' && Number.isInteger(limit) && limit >= 0 ? limit : DEFAULT_DAILY_LIMIT,
  };
}

export function isClefConfigured(config: ClefConfig): boolean {
  return config.accountId !== '' && config.apiToken !== '';
}
```

- [ ] **Step 4: `server/src/classifier/clef/clef-classifier.ts` 작성**

```ts
import { CategorySchema, type Category } from '@memo/shared';
import { z } from 'zod';
import type { ClefConfig } from './clef-config';

export type ClefFailureReason = 'timeout' | 'network' | 'invalid_response' | 'auth' | 'rate_limited';
export type ClefOutcome = 'success' | ClefFailureReason;
export type ClefCallResult =
  | { ok: true; category: Category; scores: Record<Category, number> }
  | { ok: false; reason: ClefFailureReason; retryable: boolean };

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;
export const CLEF_FETCH = Symbol('CLEF_FETCH');
export const CLEF_TIMEOUT_MS = 5000;

/** 1단계 설계 3절의 칸 정의를 Clef-flash choice 질문의 criteria로 보낸다. */
const CATEGORY_CRITERIA: Record<Category, string> = {
  todo: '내가 직접 해야 하는 작업',
  idea: '해 볼 만한 생각이나 개선안',
  check: '누군가에게 묻거나 찾아봐야 하는 것',
  reference: '행동 없이 알아만 두면 되는 정보',
};

/** 2026-10-05 실제 호출로 확인한 응답 모양 중 우리가 쓰는 부분 */
const ClefResponseSchema = z.object({
  success: z.literal(true),
  result: z.object({
    answers: z.object({
      category: z.object({
        choice: CategorySchema,
        probabilities: z.object({
          todo: z.number(),
          idea: z.number(),
          check: z.number(),
          reference: z.number(),
        }),
      }),
    }),
  }),
});

const RETRYABLE: Record<ClefFailureReason, boolean> = {
  timeout: true,
  network: true,
  invalid_response: true,
  auth: false,
  rate_limited: false,
};

function failure(reason: ClefFailureReason): ClefCallResult {
  return { ok: false, reason, retryable: RETRYABLE[reason] };
}

function failureForStatus(status: number): ClefCallResult {
  if (status === 401 || status === 403) return failure('auth');
  if (status === 429) return failure('rate_limited');
  if (status >= 500) return failure('network');
  return failure('invalid_response');
}

/** Workers AI REST API로 Clef-flash를 한 번 부르고 결과를 해석한다. 재시도·기록·대체는 ResilientClassifier가 맡는다. */
export class ClefClassifier {
  constructor(
    private readonly config: ClefConfig,
    private readonly fetchFn: FetchLike,
    private readonly timeoutMs: number = CLEF_TIMEOUT_MS,
  ) {}

  async classifyOnce(content: string): Promise<ClefCallResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      let res: Response;
      try {
        res = await this.fetchFn(
          `https://api.cloudflare.com/client/v4/accounts/${this.config.accountId}/ai/run/@cf/cloudflare/clef-flash`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${this.config.apiToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              state: content,
              questions: {
                category: {
                  type: 'choice',
                  instructions: '이 메모는 어느 칸에 들어가야 하나요?',
                  criteria: CATEGORY_CRITERIA,
                },
              },
            }),
            signal: controller.signal,
          },
        );
      } catch {
        return failure(controller.signal.aborted ? 'timeout' : 'network');
      }
      if (!res.ok) return failureForStatus(res.status);

      let body: unknown;
      try {
        body = await res.json();
      } catch {
        return failure(controller.signal.aborted ? 'timeout' : 'invalid_response');
      }
      const parsed = ClefResponseSchema.safeParse(body);
      if (!parsed.success) return failure('invalid_response');
      const answer = parsed.data.result.answers.category;
      return { ok: true, category: answer.choice, scores: answer.probabilities };
    } finally {
      clearTimeout(timer);
    }
  }
}
```

- [ ] **Step 5: 통과 확인**

Run: `pnpm -F server exec prettier --write src && pnpm -F server exec jest src/classifier/clef && pnpm -F server exec eslint src && pnpm -F server build`
Expected: PASS, lint·build exit 0

- [ ] **Step 6: Commit**

```bash
git add server/src/classifier/clef
git commit -m "✨ feat: Clef-flash 설정과 1회 호출 분류기 추가"
```

---

### Task 4: 호출 기록과 재시도·상한·대체를 맡는 ResilientClassifier

**Files:**
- Create: `server/src/classifier/clef/clef-call-log.ts`, `server/src/classifier/clef/clef-call-log.spec.ts`
- Create: `server/src/classifier/resilient-classifier.ts`, `server/src/classifier/resilient-classifier.spec.ts`

**Interfaces:**
- Consumes: Task 2의 Prisma `ClefCall`·`ClassifyResult.fallbackReason`, Task 3의 `ClefConfig`·`isClefConfigured`·`ClefCallResult`·`ClefOutcome`
- Produces:
  - `interface ClefCallLog { countSince(start: Date): Promise<number>; record(outcome: ClefOutcome): Promise<void> }`, `CLEF_CALL_LOG` 토큰, `startOfUtcDay(now: Date): Date`, `class PrismaClefCallLog implements ClefCallLog`
  - `CLEF_MAX_ATTEMPTS = 3`, `class ResilientClassifier implements Classifier { constructor(config: ClefConfig, clef: { classifyOnce(content: string): Promise<ClefCallResult> }, log: ClefCallLog, fallback: Classifier, now?: () => Date) }`

- [ ] **Step 1: 실패하는 테스트 작성 — `server/src/classifier/clef/clef-call-log.spec.ts`**

```ts
import { startOfUtcDay } from './clef-call-log';

describe('startOfUtcDay', () => {
  it('UTC 자정으로 내린다 (한국 시간 오전 9시 전후)', () => {
    expect(startOfUtcDay(new Date('2026-10-05T08:59:59Z')).toISOString()).toBe('2026-10-05T00:00:00.000Z');
    expect(startOfUtcDay(new Date('2026-10-05T00:00:00Z')).toISOString()).toBe('2026-10-05T00:00:00.000Z');
    expect(startOfUtcDay(new Date('2026-10-04T23:59:59Z')).toISOString()).toBe('2026-10-04T00:00:00.000Z');
  });
});
```

- [ ] **Step 2: 실패하는 테스트 작성 — `server/src/classifier/resilient-classifier.spec.ts`**

```ts
import type { ClefCallResult, ClefOutcome } from './clef/clef-classifier';
import type { ClefCallLog } from './clef/clef-call-log';
import type { ClefConfig } from './clef/clef-config';
import { ResilientClassifier } from './resilient-classifier';
import { RuleClassifier } from './rule-classifier';

const configured: ClefConfig = { accountId: 'a', apiToken: 't', dailyLimit: 100 };
const success: ClefCallResult = {
  ok: true,
  category: 'check',
  scores: { todo: 0.1, idea: 0.1, check: 0.7, reference: 0.1 },
};
const fail = (reason: 'timeout' | 'network' | 'invalid_response' | 'auth' | 'rate_limited', retryable: boolean): ClefCallResult => ({
  ok: false,
  reason,
  retryable,
});

class FakeLog implements ClefCallLog {
  readonly recorded: ClefOutcome[] = [];
  constructor(private readonly before = 0) {}
  countSince(): Promise<number> {
    return Promise.resolve(this.before + this.recorded.length);
  }
  record(outcome: ClefOutcome): Promise<void> {
    this.recorded.push(outcome);
    return Promise.resolve();
  }
}

function fakeClef(results: ClefCallResult[]) {
  let calls = 0;
  return {
    get calls() {
      return calls;
    },
    classifyOnce(): Promise<ClefCallResult> {
      const result = results[Math.min(calls, results.length - 1)];
      calls += 1;
      return Promise.resolve(result);
    },
  };
}

describe('ResilientClassifier', () => {
  it('Clef-flash가 성공하면 그 결과를 쓰고 호출을 1번 기록한다', async () => {
    const clef = fakeClef([success]);
    const log = new FakeLog();
    const result = await new ResilientClassifier(configured, clef, log, new RuleClassifier()).classify('배포 일정 확인');
    expect(result).toEqual({
      category: 'check',
      source: 'clef-flash',
      scores: success.ok ? success.scores : null,
      note: null,
      fallbackReason: null,
    });
    expect(log.recorded).toEqual(['success']);
  });

  it('재시도할 수 있는 실패 뒤 성공하면 Clef-flash 결과를 쓴다', async () => {
    const clef = fakeClef([fail('timeout', true), success]);
    const log = new FakeLog();
    const result = await new ResilientClassifier(configured, clef, log, new RuleClassifier()).classify('메모');
    expect(result.source).toBe('clef-flash');
    expect(log.recorded).toEqual(['timeout', 'success']);
  });

  it('3번 모두 실패하면 규칙으로 대체하고 마지막 실패 이유를 남긴다', async () => {
    const clef = fakeClef([fail('timeout', true), fail('network', true), fail('invalid_response', true)]);
    const log = new FakeLog();
    const result = await new ResilientClassifier(configured, clef, log, new RuleClassifier()).classify('회의록 작성');
    expect(clef.calls).toBe(3);
    expect(log.recorded).toEqual(['timeout', 'network', 'invalid_response']);
    expect(result).toEqual({
      category: 'todo',
      source: 'rule',
      scores: null,
      note: "키워드 '작성' 일치",
      fallbackReason: 'invalid_response',
    });
  });

  it.each([['auth'], ['rate_limited']] as const)('%s는 1번 시도 후 바로 대체한다', async (reason) => {
    const clef = fakeClef([fail(reason, false)]);
    const log = new FakeLog();
    const result = await new ResilientClassifier(configured, clef, log, new RuleClassifier()).classify('메모');
    expect(clef.calls).toBe(1);
    expect(result.fallbackReason).toBe(reason);
  });

  it('토큰이 없으면 호출하지 않고 not_configured로 대체한다', async () => {
    const clef = fakeClef([success]);
    const log = new FakeLog();
    const result = await new ResilientClassifier({ ...configured, apiToken: '' }, clef, log, new RuleClassifier()).classify('메모');
    expect(clef.calls).toBe(0);
    expect(log.recorded).toEqual([]);
    expect(result.fallbackReason).toBe('not_configured');
  });

  it('오늘 호출이 이미 상한이면 호출하지 않고 daily_limit로 대체한다', async () => {
    const clef = fakeClef([success]);
    const log = new FakeLog(100);
    const result = await new ResilientClassifier(configured, clef, log, new RuleClassifier()).classify('메모');
    expect(clef.calls).toBe(0);
    expect(result.fallbackReason).toBe('daily_limit');
  });

  it('상한 0이면 호출하지 않는다', async () => {
    const clef = fakeClef([success]);
    const result = await new ResilientClassifier({ ...configured, dailyLimit: 0 }, clef, new FakeLog(), new RuleClassifier()).classify('메모');
    expect(clef.calls).toBe(0);
    expect(result.fallbackReason).toBe('daily_limit');
  });

  it('시도 중간에 상한에 닿으면 남은 시도를 하지 않고 daily_limit로 대체한다', async () => {
    const clef = fakeClef([fail('timeout', true)]);
    const log = new FakeLog(98);
    const result = await new ResilientClassifier(configured, clef, log, new RuleClassifier()).classify('메모');
    expect(clef.calls).toBe(2);
    expect(result.fallbackReason).toBe('daily_limit');
  });

  it('하루 호출 수는 now 기준 UTC 자정부터 센다', async () => {
    const starts: Date[] = [];
    const log: ClefCallLog = {
      countSince: (start) => {
        starts.push(start);
        return Promise.resolve(0);
      },
      record: () => Promise.resolve(),
    };
    await new ResilientClassifier(configured, fakeClef([success]), log, new RuleClassifier(), () => new Date('2026-10-05T08:30:00Z')).classify('메모');
    expect(starts[0].toISOString()).toBe('2026-10-05T00:00:00.000Z');
  });
});
```

Run: `pnpm -F server exec jest src/classifier`
Expected: FAIL — `Cannot find module './clef-call-log'`, `Cannot find module './resilient-classifier'`

- [ ] **Step 3: `server/src/classifier/clef/clef-call-log.ts` 작성**

```ts
import type { PrismaService } from '../../prisma/prisma.service';
import type { ClefOutcome } from './clef-classifier';

export interface ClefCallLog {
  /** start 이후 Cloudflare에 실제로 보낸 요청 수 */
  countSince(start: Date): Promise<number>;
  record(outcome: ClefOutcome): Promise<void>;
}

export const CLEF_CALL_LOG = Symbol('CLEF_CALL_LOG');

/** Cloudflare 무료 할당량과 같은 기준(UTC 자정)으로 하루를 자른다. */
export function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export class PrismaClefCallLog implements ClefCallLog {
  constructor(private readonly prisma: PrismaService) {}

  countSince(start: Date): Promise<number> {
    return this.prisma.clefCall.count({ where: { createdAt: { gte: start } } });
  }

  async record(outcome: ClefOutcome): Promise<void> {
    await this.prisma.clefCall.create({ data: { outcome } });
  }
}
```

- [ ] **Step 4: `server/src/classifier/resilient-classifier.ts` 작성**

```ts
import type { Classifier, ClassifyResult, FallbackReason } from './category';
import type { ClefCallResult } from './clef/clef-classifier';
import { startOfUtcDay, type ClefCallLog } from './clef/clef-call-log';
import { isClefConfigured, type ClefConfig } from './clef/clef-config';

export const CLEF_MAX_ATTEMPTS = 3;

/** CLASSIFIER 자리에 꽂는 분류기. Clef-flash를 상한·재시도 규칙에 따라 부르고, 안 되면 규칙 분류기로 대체한다. */
export class ResilientClassifier implements Classifier {
  constructor(
    private readonly config: ClefConfig,
    private readonly clef: { classifyOnce(content: string): Promise<ClefCallResult> },
    private readonly log: ClefCallLog,
    private readonly fallback: Classifier,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async classify(content: string): Promise<ClassifyResult> {
    if (!isClefConfigured(this.config)) {
      return this.fallbackWith(content, 'not_configured');
    }
    let reason: FallbackReason = 'daily_limit';
    for (let attempt = 1; attempt <= CLEF_MAX_ATTEMPTS; attempt += 1) {
      const usedToday = await this.log.countSince(startOfUtcDay(this.now()));
      if (usedToday >= this.config.dailyLimit) {
        reason = 'daily_limit';
        break;
      }
      const result = await this.clef.classifyOnce(content);
      await this.log.record(result.ok ? 'success' : result.reason);
      if (result.ok) {
        return {
          category: result.category,
          source: 'clef-flash',
          scores: result.scores,
          note: null,
          fallbackReason: null,
        };
      }
      reason = result.reason;
      if (!result.retryable) break;
    }
    return this.fallbackWith(content, reason);
  }

  private async fallbackWith(content: string, reason: FallbackReason): Promise<ClassifyResult> {
    const result = await this.fallback.classify(content);
    return { ...result, fallbackReason: reason };
  }
}
```

- [ ] **Step 5: 통과 확인**

Run: `pnpm -F server exec prettier --write src && pnpm -F server test && pnpm -F server exec eslint src && pnpm -F server build`
Expected: 모든 단위 테스트 PASS, lint·build exit 0

- [ ] **Step 6: Commit**

```bash
git add server/src/classifier
git commit -m "✨ feat: 하루 상한과 재시도 뒤 규칙으로 대체하는 분류기 추가"
```

---

### Task 5: CLASSIFIER에 ResilientClassifier 연결과 e2e

**Files:**
- Modify: `server/src/memos/memos.module.ts`
- Modify: `server/test/setup-env.ts`
- Modify: `server/package.json` (`test:e2e`에 `--runInBand`)
- Create: `server/test/clef.e2e-spec.ts`

**Interfaces:**
- Consumes: Task 3의 `CLEF_CONFIG`·`loadClefConfig`·`CLEF_FETCH`·`ClefClassifier`·`FetchLike`, Task 4의 `CLEF_CALL_LOG`·`PrismaClefCallLog`·`ResilientClassifier`
- Produces: e2e에서 `.overrideProvider(CLEF_CONFIG)`·`.overrideProvider(CLEF_FETCH)`로 Clef 경로를 가짜로 바꿀 수 있는 모듈 구성

- [ ] **Step 1: 테스트에서 실제 토큰을 쓰지 않게 막기 — `server/test/setup-env.ts` 전체 교체**

```ts
// 개발 DB(memo)를 건드리지 않도록 e2e 테스트는 memo_test를 쓴다.
process.env.DATABASE_URL = 'postgresql://memo:memo@localhost:5433/memo_test';
// server/.env에 실제 토큰이 있어도 e2e는 Cloudflare를 부르지 않는다(not_configured).
// Clef-flash 경로는 각 테스트가 CLEF_CONFIG·CLEF_FETCH를 가짜로 바꿔 검증한다.
process.env.CLOUDFLARE_ACCOUNT_ID = '';
process.env.CLOUDFLARE_API_TOKEN = '';
```

`server/package.json`의 `test:e2e` script를 아래로 바꾼다. e2e 파일들이 같은 `memo_test` DB를 비우고 쓰므로, 병렬로 돌면 서로의 데이터를 지운다.

```json
"test:e2e": "jest --config ./test/jest-e2e.json --runInBand",
```

- [ ] **Step 2: 실패하는 테스트 작성 — `server/test/clef.e2e-spec.ts`**

```ts
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request, { Response } from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { CLEF_FETCH, type FetchLike } from '../src/classifier/clef/clef-classifier';
import { CLEF_CONFIG } from '../src/classifier/clef/clef-config';
import type { MemoDto } from '../src/memos/memo.dto';
import { PrismaService } from '../src/prisma/prisma.service';

const bodyOf = <T>(res: Response): T => res.body as T;

const okBody = {
  result: {
    answers: {
      category: {
        type: 'choice',
        choice: 'check',
        probabilities: { todo: 0.15, idea: 0.02, check: 0.76, reference: 0.07 },
        confidence: 0.49,
      },
    },
  },
  success: true,
  errors: [],
  messages: [],
};

/** 응답을 차례로 돌려주는 가짜 fetch. 호출 수를 센다. */
function scriptedFetch(statuses: number[]) {
  const fake = {
    calls: 0,
    fn: (() => {
      const status = statuses[Math.min(fake.calls, statuses.length - 1)];
      fake.calls += 1;
      return Promise.resolve(
        new globalThis.Response(JSON.stringify(status === 200 ? okBody : { success: false }), { status }),
      );
    }) as FetchLike,
  };
  return fake;
}

describe('Clef-flash 분류 (e2e, 가짜 Cloudflare)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let fake: ReturnType<typeof scriptedFetch>;

  async function start(statuses: number[], dailyLimit = 100) {
    fake = scriptedFetch(statuses);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(CLEF_CONFIG)
      .useValue({ accountId: 'test-account', apiToken: 'test-token', dailyLimit })
      .overrideProvider(CLEF_FETCH)
      .useValue(fake.fn)
      .compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    await prisma.memo.deleteMany();
    await prisma.clefCall.deleteMany();
  }

  afterEach(async () => {
    await app.close();
  });

  it('성공하면 clef-flash 결과와 칸별 확률을 저장하고 호출 1번을 기록한다', async () => {
    await start([200]);
    const res = await request(app.getHttpServer()).post('/api/memos').send({ content: '배포 일정 PM한테 확인' }).expect(201);
    expect(bodyOf<MemoDto>(res)).toMatchObject({
      modelCategory: 'check',
      source: 'clef-flash',
      scores: { todo: 0.15, idea: 0.02, check: 0.76, reference: 0.07 },
      note: null,
      fallbackReason: null,
    });
    expect(fake.calls).toBe(1);
    expect(await prisma.clefCall.count({ where: { outcome: 'success' } })).toBe(1);
  });

  it('5xx가 3번이면 규칙으로 대체하고 network를 남긴다', async () => {
    await start([503]);
    const res = await request(app.getHttpServer()).post('/api/memos').send({ content: '회의록 작성' }).expect(201);
    expect(bodyOf<MemoDto>(res)).toMatchObject({
      modelCategory: 'todo',
      source: 'rule',
      scores: null,
      note: "키워드 '작성' 일치",
      fallbackReason: 'network',
    });
    expect(fake.calls).toBe(3);
    expect(await prisma.clefCall.count()).toBe(3);
  });

  it('401이면 1번만 호출하고 auth로 대체한다', async () => {
    await start([401]);
    const res = await request(app.getHttpServer()).post('/api/memos').send({ content: '회의록 작성' }).expect(201);
    expect(bodyOf<MemoDto>(res).fallbackReason).toBe('auth');
    expect(fake.calls).toBe(1);
  });

  it('하루 상한에 닿아 있으면 호출하지 않고 daily_limit로 대체한다', async () => {
    await start([200], 1);
    await prisma.clefCall.create({ data: { outcome: 'success' } });
    const res = await request(app.getHttpServer()).post('/api/memos').send({ content: '회의록 작성' }).expect(201);
    expect(bodyOf<MemoDto>(res).fallbackReason).toBe('daily_limit');
    expect(fake.calls).toBe(0);
  });

  it('GET은 fallbackReason을 포함해 돌려준다', async () => {
    await start([401]);
    await request(app.getHttpServer()).post('/api/memos').send({ content: '회의록 작성' }).expect(201);
    const res = await request(app.getHttpServer()).get('/api/memos').expect(200);
    expect(bodyOf<{ memos: MemoDto[] }>(res).memos[0].fallbackReason).toBe('auth');
  });
});

describe('토큰이 없는 기본 설정 (e2e)', () => {
  it('Cloudflare를 부르지 않고 not_configured로 대체한다', async () => {
    const fetchCalls: string[] = [];
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(CLEF_FETCH)
      .useValue(((url: string) => {
        fetchCalls.push(url);
        return Promise.reject(new Error('호출되면 안 됨'));
      }) as FetchLike)
      .compile();
    const app = moduleRef.createNestApplication({ logger: false });
    configureApp(app);
    await app.init();
    const res = await request(app.getHttpServer()).post('/api/memos').send({ content: '회의록 작성' }).expect(201);
    expect(bodyOf<MemoDto>(res).fallbackReason).toBe('not_configured');
    expect(fetchCalls).toEqual([]);
    await app.close();
  });
});
```

Run: `pnpm -F server test:e2e:prepare && pnpm test:e2e`
Expected: FAIL — `CLEF_CONFIG`·`CLEF_FETCH` provider가 모듈에 없어 override할 대상이 없거나, `fallbackReason`이 `null`로 응답됨

- [ ] **Step 3: `server/src/memos/memos.module.ts` 전체 교체**

```ts
import { Module } from '@nestjs/common';
import { CLASSIFIER } from '../classifier/category';
import { CLEF_CALL_LOG, PrismaClefCallLog, type ClefCallLog } from '../classifier/clef/clef-call-log';
import { CLEF_FETCH, ClefClassifier, type FetchLike } from '../classifier/clef/clef-classifier';
import { CLEF_CONFIG, loadClefConfig, type ClefConfig } from '../classifier/clef/clef-config';
import { ResilientClassifier } from '../classifier/resilient-classifier';
import { RuleClassifier } from '../classifier/rule-classifier';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import { MemosController } from './memos.controller';
import { MemosService } from './memos.service';

@Module({
  imports: [PrismaModule],
  controllers: [MemosController],
  providers: [
    MemosService,
    { provide: CLEF_CONFIG, useFactory: (): ClefConfig => loadClefConfig() },
    {
      provide: CLEF_FETCH,
      useValue: ((url, init) => fetch(url, init)) satisfies FetchLike,
    },
    {
      provide: CLEF_CALL_LOG,
      useFactory: (prisma: PrismaService): ClefCallLog => new PrismaClefCallLog(prisma),
      inject: [PrismaService],
    },
    {
      provide: CLASSIFIER,
      useFactory: (config: ClefConfig, fetchFn: FetchLike, log: ClefCallLog) =>
        new ResilientClassifier(config, new ClefClassifier(config, fetchFn), log, new RuleClassifier()),
      inject: [CLEF_CONFIG, CLEF_FETCH, CLEF_CALL_LOG],
    },
  ],
})
export class MemosModule {}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm -F server exec prettier --write src test && pnpm -F server test && pnpm test:e2e && pnpm -F server build && pnpm -F server exec eslint src test/memos.e2e-spec.ts test/server-error.e2e-spec.ts test/clef.e2e-spec.ts`
Expected: 단위 PASS, e2e는 기존 11개(파일 무수정) + 새 6개 PASS, build·lint exit 0
Run: `git diff --stat HEAD -- server/test/memos.e2e-spec.ts server/test/server-error.e2e-spec.ts`
Expected: 출력 없음

- [ ] **Step 5: Commit**

```bash
git add server/src/memos/memos.module.ts server/test server/package.json
git commit -m "✨ feat: CLASSIFIER에 Clef-flash 재시도 분류기 연결"
```

---

### Task 6: 화면에 확률 막대·대체 배지·입력 잠금 추가

**Files:**
- Modify: `web/src/api.ts`, `web/src/components/MemoCard.tsx`, `web/src/components/MemoInput.tsx`, `web/src/App.tsx`, `web/src/App.css`
- Create: `web/src/components/ScoreBars.tsx`

**Interfaces:**
- Consumes: Task 1의 `FallbackReason`, `MemoSchema.fallbackReason`
- Produces: `web/src/api.ts`의 `type FallbackReason` re-export, `FALLBACK_LABELS: Record<FallbackReason, string>`, component `ScoreBars({ scores })`

- [ ] **Step 1: `web/src/api.ts` 수정**

첫 import 줄을 아래로 바꾸고:

```ts
import type { Category, ClassifierSource, FallbackReason, HitStats, Memo } from '@memo/shared';
```

re-export 줄을 아래로 바꾸고:

```ts
export type { Category, ClassifierSource, FallbackReason, HitCount, HitStats, Memo } from '@memo/shared';
```

`SOURCE_LABELS` 선언 다음에 추가:

```ts
export const FALLBACK_LABELS: Record<FallbackReason, string> = {
  timeout: '응답 시간 초과',
  network: '네트워크 오류',
  invalid_response: '응답 형식 오류',
  auth: 'API 인증 실패',
  rate_limited: 'Cloudflare 호출 제한',
  daily_limit: '오늘 호출 상한 도달',
  not_configured: 'API 키 없음',
};
```

- [ ] **Step 2: `web/src/components/ScoreBars.tsx` 작성**

```tsx
import { CATEGORIES, CATEGORY_LABELS, type Category } from '../api';

/** Clef-flash가 낸 칸별 확률. 높은 순으로 그리고 가장 높은 칸을 강조한다. */
export function ScoreBars({ scores }: { scores: Record<Category, number> }) {
  const ordered = [...CATEGORIES].sort((a, b) => scores[b] - scores[a]);
  const top = ordered[0];
  return (
    <ul className="scores" aria-label="칸별 확률">
      {ordered.map((category) => {
        const percent = Math.round(scores[category] * 100);
        return (
          <li key={category} className={category === top ? 'score top' : 'score'}>
            <span className="score-label">{CATEGORY_LABELS[category]}</span>
            <span className="score-track">
              <span className="score-fill" style={{ width: `${percent}%` }} />
            </span>
            <span className="score-value">{percent}%</span>
          </li>
        );
      })}
    </ul>
  );
}
```

- [ ] **Step 3: `web/src/components/MemoCard.tsx` 전체 교체**

```tsx
import {
  CATEGORIES,
  CATEGORY_LABELS,
  FALLBACK_LABELS,
  SOURCE_LABELS,
  type Category,
  type Memo,
} from '../api';
import { ScoreBars } from './ScoreBars';

interface Props {
  memo: Memo;
  onMove: (id: string, category: Category) => void;
}

function badgeOf(memo: Memo): { label: string; className: string } {
  if (memo.source === 'clef-flash') {
    return { label: SOURCE_LABELS['clef-flash'], className: 'badge clef-flash' };
  }
  if (memo.fallbackReason) {
    return { label: '대체 규칙', className: 'badge fallback' };
  }
  return { label: SOURCE_LABELS.rule, className: 'badge rule' };
}

export function MemoCard({ memo, onMove }: Props) {
  const badge = badgeOf(memo);
  return (
    <article className="card">
      <p className="content">{memo.content}</p>
      <div className="meta">
        <span className={badge.className}>{badge.label}</span>
        {memo.fallbackReason && (
          <span className="fallback-reason">{FALLBACK_LABELS[memo.fallbackReason]}</span>
        )}
        {memo.note && <span className="note">{memo.note}</span>}
      </div>
      {memo.scores && <ScoreBars scores={memo.scores} />}
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

- [ ] **Step 4: 분류 중 입력 잠금과 대기 문구**

`web/src/components/MemoInput.tsx`의 `<input` 속성에 `disabled={disabled}`를 추가한다:

```tsx
      <input
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="떠오른 생각을 한 줄로 적어 보세요"
        aria-label="메모"
        disabled={disabled}
      />
```

`web/src/App.tsx`의 대기 카드 문구를 바꾼다:

```tsx
          <p className="note">분류 중… (최대 15초)</p>
```

- [ ] **Step 5: `web/src/App.css` 끝에 추가**

```css
.badge.fallback {
  border-color: var(--danger);
  color: var(--danger);
}

.fallback-reason {
  color: var(--danger);
  font-size: 0.8rem;
}

.memo-input input:disabled {
  opacity: 0.6;
}

.scores {
  list-style: none;
  margin: 8px 0 0;
  padding: 0;
  display: grid;
  gap: 3px;
  font-size: 0.75rem;
  color: var(--muted);
}

.score {
  display: grid;
  grid-template-columns: 5.5em 1fr 3em;
  align-items: center;
  gap: 6px;
}

.score.top {
  color: var(--text);
  font-weight: 600;
}

.score-track {
  height: 6px;
  border-radius: 3px;
  background: var(--border);
  overflow: hidden;
}

.score-fill {
  display: block;
  height: 100%;
  background: var(--muted);
}

.score.top .score-fill {
  background: var(--accent);
}

.score-value {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
```

- [ ] **Step 6: 확인**

Run: `pnpm -F web build && pnpm -F web lint`
Expected: build exit 0, lint는 기존 경고 1건(`set-state-in-effect`)만

- [ ] **Step 7: Commit**

```bash
git add web/src
git commit -m "✨ feat: 메모 카드에 칸별 확률 막대와 대체 규칙 배지 추가"
```

---

### Task 7: Docker 토큰 전달, 실행 안내, 최종 확인

**Files:**
- Modify: `docker-compose.yml`(server 서비스), `README.md`, `HANDOFF.md`

**Interfaces:**
- Consumes: Task 1~6 전부
- Produces: `docker compose up`으로 server 컨테이너가 `server/.env`의 Cloudflare 변수를 받는 실행 환경

- [ ] **Step 1: `docker-compose.yml`의 server 서비스에 `env_file` 추가** (`environment:` 바로 위)

```yaml
    # server/.env의 CLOUDFLARE_* 값을 넘긴다. 파일이 없어도 뜨고(규칙 분류기로 동작), DATABASE_URL은 아래 environment가 덮어쓴다.
    env_file:
      - path: ./server/.env
        required: false
```

- [ ] **Step 2: `README.md`의 「바꿨을 때 다시 띄우기」 절 앞에 절 추가**

````markdown
## Clef-flash 연결

`server/.env`에 Cloudflare 값을 넣으면 Clef-flash로 분류합니다. 비워 두면 규칙 분류기로 동작합니다(배지 `대체 규칙`, 이유 "API 키 없음").

```dotenv
CLOUDFLARE_ACCOUNT_ID=
CLOUDFLARE_API_TOKEN=     # 권한: Workers AI Read·Edit만
CLEF_DAILY_LIMIT=100      # 선택. 하루(UTC) 최대 호출 수
```

- `docker compose up`이 이 파일을 server 컨테이너에 넘깁니다. 값을 바꾸면 `docker compose up -d server`로 다시 띄웁니다.
- 테스트(`pnpm test`, `pnpm test:e2e`)는 Cloudflare를 부르지 않습니다.
````

- [ ] **Step 3: 처음부터 실행과 실제 호출 확인 (실제 호출 합계 5번 이내)**

```bash
docker compose down -v
docker compose up -d --build
```

Run (server가 뜰 때까지 기다린 뒤): `curl -s -X POST localhost:3000/api/memos -H 'Content-Type: application/json' -d '{"content":"배포 일정 PM한테 확인"}'`
Expected: `"source":"clef-flash"`, `"scores":{...}`, `"fallbackReason":null` (실제 호출 1번)

- [ ] **Step 4: 대체 경로 확인 (실제 호출 0번)**

```bash
docker compose stop server
docker compose run --rm -d --service-ports --name memo-limit -e CLEF_DAILY_LIMIT=0 server
```

Run (뜰 때까지 기다린 뒤): `curl -s -X POST localhost:3000/api/memos -H 'Content-Type: application/json' -d '{"content":"회의록 작성"}'`
Expected: `"source":"rule"`, `"fallbackReason":"daily_limit"`

```bash
docker stop memo-limit
docker compose run --rm -d --service-ports --name memo-noconf -e CLOUDFLARE_API_TOKEN= server
```

Run: 같은 `curl`
Expected: `"fallbackReason":"not_configured"`

```bash
docker stop memo-noconf
docker compose start server
```

- [ ] **Step 5: 화면 확인 (실제 호출 1~2번)**

`pnpm dev:web`을 띄우고 `http://localhost:5173`에서 확인한다.
- Step 3의 카드: `Clef-flash` 배지와 4칸 확률 막대, 가장 높은 칸 강조
- Step 4의 카드 2개: `대체 규칙` 배지와 "오늘 호출 상한 도달", "API 키 없음"
- 새 메모 1개 입력: 분류 중에는 입력창·버튼 잠금, 대기 카드 "분류 중… (최대 15초)"

- [ ] **Step 6: 비밀값 확인**

Run: `git ls-files | grep -E '(^|/)\.env$'; git grep -nE 'CLOUDFLARE_API_TOKEN=[^ ]' -- ':!*.example' ':!*.md'`
Expected: 두 명령 모두 출력 없음

- [ ] **Step 7: HANDOFF.md 갱신과 commit**

HANDOFF.md 3-6절에 구현 완료(commit SHA 범위, 테스트 수, 실제 호출 횟수)를 한 줄 추가하고, 「받는 작업 공간에 요청하는 첫 행동」을 "2단계 구현 완료, push·PR 승인 대기"로 바꾼다.

```bash
git add docker-compose.yml README.md HANDOFF.md
git commit -m "🐳 chore: Clef-flash 토큰 전달과 실행 안내 추가"
```
