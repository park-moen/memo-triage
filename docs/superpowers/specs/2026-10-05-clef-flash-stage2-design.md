# 2단계: Clef-flash 분류기 연결 설계

- 작성일: 2026-10-05
- 상태: 설계 승인 완료, 문서 검토 대기
- 기준 문서: `docs/superpowers/specs/2026-10-04-memo-classifier-design.md`(1단계 설계, 2단계 범위는 8절에서 승인됨), `docs/superpowers/specs/2026-10-05-shared-schema-design.md`(10절: 새 계약은 shared schema부터)
- 이 문서는 기준 문서에서 **바뀌거나 비어 있던 부분**만 다룬다. 메모 1개당 최대 3번 호출, 하루 상한 `CLEF_DAILY_LIMIT`(100), 실패 시 규칙 분류기로 대체 같은 승인된 규칙은 그대로 따른다.

## 1. 목표

server가 메모를 Cloudflare Workers AI의 Clef-flash(`@cf/cloudflare/clef-flash`)로 분류하고, 실패하면 규칙 분류기로 대체한다. 화면에는 칸별 확률과 판단 출처(Clef-flash·규칙·대체 규칙)를 보여 주어, 모델 판단과 규칙의 차이를 적중 횟수로 비교할 수 있게 한다.

## 2. 확인한 외부 사실 (2026-10-05)

- 요청: `POST https://api.cloudflare.com/client/v4/accounts/{CLOUDFLARE_ACCOUNT_ID}/ai/run/@cf/cloudflare/clef-flash`, 헤더 `Authorization: Bearer {CLOUDFLARE_API_TOKEN}`.
- 실제로 1회 호출한 요청 본문:

  ```json
  {
    "state": "배포 일정 PM한테 확인",
    "questions": {
      "category": {
        "type": "choice",
        "instructions": "이 메모는 어느 칸에 들어가야 하나요?",
        "criteria": {
          "todo": "내가 직접 해야 하는 작업",
          "idea": "해 볼 만한 생각이나 개선안",
          "check": "누군가에게 묻거나 찾아봐야 하는 것",
          "reference": "행동 없이 알아만 두면 되는 정보"
        }
      }
    }
  }
  ```

- 받은 응답(HTTP 200):

  ```json
  {
    "result": {
      "model": "clef-flash",
      "answers": {
        "category": {
          "type": "choice",
          "choice": "check",
          "probabilities": { "todo": 0.1477, "idea": 0.0151, "check": 0.7676, "reference": 0.0696 },
          "confidence": 0.488
        }
      },
      "usage": { "input_tokens": 194, "output_tokens": 0 }
    },
    "success": true,
    "errors": [],
    "messages": []
  }
  ```

- 호출 1번에 입력 약 194 token이 든다. 하루 무료 할당량(10,000 Neuron) 대비 상한 100번은 넉넉히 안전하다(Neuron 환산은 어림값).
- 무료 할당량은 UTC 자정에 초기화된다. 우리 하루 상한도 UTC 날짜로 센다.
- 남은 확인: REST 호출이 대시보드의 Workers AI 사용량에 잡히는지(사용자가 대시보드로 확인).

## 3. 공유 계약 (`@memo/shared`)

- 새 상수와 schema: `FALLBACK_REASONS = ['timeout', 'network', 'invalid_response', 'auth', 'rate_limited', 'daily_limit', 'not_configured']`, `FallbackReasonSchema`, `type FallbackReason`.

  | 코드 | 뜻 |
  | --- | --- |
  | `timeout` | 5초 안에 응답 없음 |
  | `network` | 네트워크 오류 또는 Cloudflare 5xx |
  | `invalid_response` | 응답 모양이 예상과 다름, `success: false`, 그 밖의 4xx |
  | `auth` | 401·403, 토큰 인증 실패 |
  | `rate_limited` | 429, Cloudflare가 호출을 거절함(무료 할당량 소진 등) |
  | `daily_limit` | 우리 하루 상한 도달 |
  | `not_configured` | `CLOUDFLARE_ACCOUNT_ID` 또는 `CLOUDFLARE_API_TOKEN`이 비어 있음 |

- `MemoSchema`에 `fallbackReason: FallbackReasonSchema.nullable()`을 더한다.
- `HitStatsSchema`의 키를 `CLASSIFIER_SOURCES`에서 만든다(공유 schema 작업에서 미룬 Minor).
- Clef-flash 응답 schema는 shared에 두지 않는다. web과 server 사이의 계약이 아니라 server와 외부 API 사이의 일이므로 server 안에 둔다.

## 4. DB (Prisma migration)

- `memos`에 `fallback_reason`(text, nullable) 추가. 기존 1단계 메모는 null로 남는다.
- 새 테이블 `clef_calls`

  | 열 | 설명 |
  | --- | --- |
  | `id` | 기본 키 |
  | `created_at` | 호출 시각 |
  | `outcome` | `success`·`timeout`·`network`·`invalid_response`·`auth`·`rate_limited` |

- Cloudflare에 실제로 요청을 보냈을 때만 한 줄을 남긴다. 상한이나 토큰 없음으로 호출하지 않은 경우는 남기지 않는다.
- 하루 호출 수 = 오늘(UTC) `created_at`인 `clef_calls` 줄 수.

## 5. server 흐름

구조는 조합(decorator)이다. `CLASSIFIER` 주입 토큰에 `ResilientClassifier`를 꽂는다. `MemosService`, controller, API 3종은 바뀌지 않는다.

```
CLASSIFIER = ResilientClassifier
  ├ 토큰 없음 → RuleClassifier + fallbackReason "not_configured"
  ├ 오늘(UTC) 호출 수 ≥ CLEF_DAILY_LIMIT → RuleClassifier + "daily_limit"
  └ ClefClassifier × 최대 3 (매번 clef_calls 기록, 중간에 상한 도달 시 중단)
        ├ 성공 → source "clef-flash", scores = probabilities, note = null, fallbackReason = null
        └ 실패 → RuleClassifier + fallbackReason = 마지막 실패 이유
```

### 5-1. `ClefClassifier` (호출 1번과 응답 해석)

- 2절의 요청 본문으로 1번 호출한다. 메모 원문이 `state`, 4칸 정의(1단계 설계 3절)가 `criteria`다.
- 시간 제한 5초(`AbortController`).
- 결과 분류

  | 결과 | 분류 | 재시도 |
  | --- | --- | --- |
  | 200, 응답 모양이 맞음 | 성공: 칸 = `choice`, `scores` = `probabilities` | — |
  | 200, `success: false` 또는 모양이 다름 | `invalid_response` | O |
  | 401, 403 | `auth` | X |
  | 429 | `rate_limited` | X |
  | 5xx, 연결 실패 | `network` | O |
  | 5초 초과 | `timeout` | O |
  | 그 밖의 4xx | `invalid_response` | O |

- 응답 검사는 server 안의 zod schema로 한다. `result.answers.category.choice`가 4칸 중 하나이고, `probabilities`에 4칸이 모두 숫자로 있어야 성공이다.

### 5-2. `ResilientClassifier` (상한·기록·재시도·대체)

- 위 다이어그램 순서를 따른다. 재시도할 수 없는 실패(`auth`, `rate_limited`)를 만나면 바로 멈춘다.
- 시도할 때마다 `clef_calls`에 결과를 남긴다. 다음 시도 전에 상한을 다시 확인한다.
- 대체할 때 `note`에는 규칙 분류기의 근거(예: "키워드 '작성' 일치")가 그대로 남는다.

### 5-3. 설정과 실행 환경

- 환경 변수: `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, `CLEF_DAILY_LIMIT`(선택, 기본 100). 시간 제한 5초와 최대 3번은 코드 상수로 둔다.
- 토큰은 사용자가 직접 만들어 `server/.env`에 넣는다. `server/.env.example`에는 빈 값만 둔다. 토큰 권한은 Workers AI(Read, Edit)만 주고, 쓰지 않은 사용량이 보이면 사용자가 폐기한다.
- Docker: `docker-compose.yml`의 server에 `env_file: server/.env`를 더한다. `DATABASE_URL`은 지금처럼 `environment`가 덮어쓴다.

## 6. web

- 확률 막대: `scores`가 있으면 4칸의 확률을 막대와 %로 보여 주고 가장 높은 칸을 강조한다.
- 배지
  - `source: clef-flash` → `Clef-flash`
  - `source: rule` + `fallbackReason` 있음 → `대체 규칙`과 이유 문구
  - `source: rule` + `fallbackReason` 없음(1단계 메모) → `규칙`
- 대체 이유의 한국어 문구는 web의 `FALLBACK_LABELS`에 둔다. 예: `timeout` → "응답 시간 초과", `daily_limit` → "오늘 호출 상한 도달", `not_configured` → "API 키 없음".
- 분류 중에는 입력창과 버튼을 모두 잠그고, 대기 카드에 "분류 중… (최대 15초)"를 표시한다(1단계 최종 리뷰 Minor 반영).

```
┌ 확인할 것 ───────────────────────┐   ┌ 할 일 ───────────────────────────┐
│ 배포 일정 PM한테 확인               │   │ 회의록 작성                        │
│ [Clef-flash]                     │   │ [대체 규칙] 응답 시간 초과           │
│ 확인할 것 ███████████████░ 77%    │   │ 키워드 '작성' 일치                 │
│ 할 일     ███░░░░░░░░░░░░ 15%    │   │ 칸 이동 [할 일 ▾]                  │
│ 참고      █░░░░░░░░░░░░░░  7%    │   └──────────────────────────────────┘
│ 아이디어   ░░░░░░░░░░░░░░░  2%    │
│ 칸 이동 [확인할 것 ▾]               │
└──────────────────────────────────┘
```

## 7. 테스트

- **agent가 실행하는 테스트는 실제 Cloudflare를 부르지 않는다.**
  - e2e 테스트 환경 설정에서 `CLOUDFLARE_ACCOUNT_ID`·`CLOUDFLARE_API_TOKEN`을 비워(`not_configured`), 기존 e2e 11개가 그대로 규칙 경로로 돈다. `server/.env`에 실제 토큰이 있어도 테스트가 쓰지 않게 하는 장치다.
- shared: `FallbackReasonSchema`, `MemoSchema.fallbackReason`, 새 `HitStatsSchema` 테스트.
- `ClefClassifier`: 가짜 `fetch`로 성공, 시간 초과, 401, 429, 5xx, 연결 실패, 모양 오류, `success: false`를 확인한다.
- `ResilientClassifier`: 가짜 Clef와 가짜 호출 기록으로 다음을 확인한다.
  - 3번 실패하면 대체하고 `fallbackReason`이 마지막 실패 이유다.
  - `auth`·`rate_limited`는 1번 시도 후 멈춘다.
  - 상한이면 호출 0번, `daily_limit`.
  - 시도 중간에 상한에 닿으면 멈춘다.
  - 시도마다 기록이 남는다.
  - 토큰이 없으면 호출 0번, `not_configured`.
- e2e: 가짜 Clef를 꽂아 `POST /api/memos`가 `scores`·`source`·`fallbackReason`을 제대로 저장·응답하는지 확인한다.
- 실제 호출은 마지막 확인에서만 하고 5번 이내로 제한한다.

## 8. 완료 기준

1. Docker로 띄운 화면에서 메모를 넣으면 Clef-flash 카드와 확률 막대가 나온다(실제 호출).
2. `CLEF_DAILY_LIMIT=0`이나 빈 토큰으로 띄우면 `대체 규칙`과 이유 문구가 나온다.
3. 1단계 규칙 메모는 계속 `규칙`으로 보인다.
4. 기존 e2e 11개와 새 테스트가 모두 통과하고, server·web build와 lint가 통과한다.
5. 토큰이 Git에 들어가지 않는다.

## 9. 범위 밖 (backlog)

- `confidence` 표시
- web의 실행 중 응답 검사
- 1단계 최종 리뷰에서 미룬 나머지 Minor: NUL·짝 없는 surrogate 입력이 400이 아니라 500, 칸 이동 select가 목록 갱신 전까지 원래 값으로 돌아감, `server/README.md`·`web/README.md` scaffold 기본 문서
- 공유 schema 작업에서 미룬 나머지 Minor: shared 개별 schema 테스트 보강, shared `tsconfig.json`의 `declaration`+`noEmit` 중복, `parseWith` fallback 문구에 도달하지 않음

## 10. 진행 방식

- 계획 승인 뒤 Orca worktree를 만들고, 그 worktree 카드 터미널의 새 Claude 세션에서 `superpowers:subagent-driven-development`로 구현한다.
- 작업 branch와 GitHub PR로 합친다. push와 PR 생성은 그 시점에 사용자 승인을 받는다.
- Docker stack은 한 번에 한 폴더에서만 띄운다.
