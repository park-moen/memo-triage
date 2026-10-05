# 공유 zod schema 설계

- 작성일: 2026-10-05
- 상태: 설계 승인 완료, 문서 검토 대기
- 배경: 메모 분류함 1단계 최종 리뷰(2026-10-04)에서 web과 server에 같은 타입(`Category`, `MemoDto`, `HitStats`)이 따로 정의된 점이 Minor로 지적됐다. 사용자가 2단계(Clef-flash 연결) 전에 별도 branch·PR로 해결하기로 했다.

## 1. 목적

web과 server가 주고받는 데이터의 모양(API 계약)을 zod schema 한곳에서 정의하고, 양쪽이 같은 schema를 import하게 한다. 2단계에서 `scores`(칸별 확률) 같은 계약이 바뀔 때 한 곳만 고치면 되게 하는 것이 목표다.

화면과 API 동작, 오류 문구는 바뀌지 않는다.

## 2. 중복이 생긴 원인

web과 server가 코드를 공유하지 않는 별개의 npm 프로젝트이기 때문이다. Prisma 때문이 아니다. 칸 값은 DB에 `String`으로 저장되고 타입은 server에 직접 썼으므로, ORM을 Drizzle 등으로 바꿔도 web과 server 사이의 중복은 남는다.

## 3. 결정 사항

| 항목 | 결정 | 고르지 않은 안과 이유 |
| --- | --- | --- |
| zod 범위 | 요청·응답 schema와 DTO를 모두 shared에 정의한다. server는 요청 body를 실행 중에 검사하고, web은 같은 schema에서 타입과 상수를 가져다 쓴다 | web의 실행 중 응답 검사: 중복 제거와는 별개인 안전장치라 후속 작업으로 뺀다(10절). zod 없이 타입만 공유: 입력 규칙 중복이 남는다 |
| 공유 방식 | workspaces + build. `packages/shared`를 `tsup`으로 CJS·ESM·타입 선언 동시 build | TS 원본 직접 import: server(Nest, CommonJS) build가 바깥 `.ts`를 출력하지 않아 webpack 번들링 전환이 필요하다. 경로 별칭: server 출력 폴더 구조와 Docker 복사 설정이 흩어진다 |
| package manager | npm → pnpm workspaces | npm workspaces: 가능하지만 pnpm이 의존성을 엄격하게 관리하고(`workspace:*`, `--filter`) monorepo에서 더 널리 쓰인다 |
| 작업 공간 | `superpowers:using-git-worktrees`로 만든 worktree | 이 폴더에서 branch: 실패 시 `node_modules` 재설치 등 정리가 많다 |
| 실행 방식 | `superpowers:subagent-driven-development` | Native: TDD는 똑같이 하지만, Task마다 별도 subagent가 코드를 리뷰하지 않고 마지막에 한 번만 리뷰한다. 비용은 더 적다. 병렬 subagent: Task가 서로 의존해 맞지 않는다 |

## 4. 구조

```
package.json            루트: private, packageManager(pnpm 버전 고정), 공통 script
pnpm-workspace.yaml     server, web, packages/*
pnpm-lock.yaml          lockfile 하나 (server·web의 package-lock.json 삭제)
packages/shared/        @memo/shared — zod schema, tsup build
server/                 "@memo/shared": "workspace:*"
web/                    "@memo/shared": "workspace:*"
```

### `@memo/shared`가 정의하는 것 (API 계약)

- `CATEGORIES`(`todo·idea·check·reference`)와 `CategorySchema`
- `ClassifierSourceSchema`(`rule·clef-flash`)
- `MAX_CONTENT_LENGTH`(200)
- 메모 생성 body: 앞뒤 공백 제거 후 1자 이상, 200자 이하(code point 기준). 오류 문구 `메모를 입력해 주세요.`, `메모는 200자 이하로 입력해 주세요.`를 schema 안에 둔다
- 칸 이동 body: 칸 값이 4개 중 하나. 오류 문구 `옮길 칸이 올바르지 않습니다.`
- 응답: `MemoSchema`(지금의 `MemoDto`), `HitStatsSchema`, 목록 응답 schema
- TypeScript 타입은 모두 `z.infer`로 만든다

### 공유하지 않는 것

- server 내부: `ClassifyResult`, `Classifier`, `CLASSIFIER` 토큰(분류기 교체 지점), `toMemoDto`(Prisma 행 → 응답 변환)
- web 화면 문구: `CATEGORY_LABELS`, `SOURCE_LABELS`
- Prisma schema와 DB 구조

## 5. 적용

### server

- `parseContent`·`parseCategory`를 없애고, controller가 `parseWith(schema, body)` helper로 body를 검사한다. 실패하면 첫 번째 issue의 한국어 문구로 `BadRequestException`(400)을 던진다.
- `Category`, `ClassifierSource`, `MemoDto`, `HitStats` 타입을 shared에서 가져온다.
- 입력 규칙 단위 테스트는 shared로 옮긴다. server e2e 테스트는 수정하지 않는다.

### web

- `web/src/api.ts`의 타입 선언을 지우고 shared에서 가져온다. `CATEGORIES`와 `MAX_CONTENT_LENGTH`도 shared 값을 쓴다.
- 칸 목록을 실행 중에 쓰므로 web 번들에 zod가 포함된다. 로컬 도구라 번들 크기는 문제 삼지 않는다.
- 화면 문구(`CATEGORY_LABELS`, `SOURCE_LABELS`)는 web에 둔다.

### Docker와 개발 흐름

- `docker-compose.yml`의 server build 범위를 `./server`에서 저장소 루트로 넓힌다(Dockerfile은 `server/Dockerfile` 유지).
- Dockerfile은 corepack으로 pnpm을 켜고, server와 shared에 필요한 의존성만 설치한 뒤 shared를 build하고 server를 실행한다. 1단계에서 추가한 `procps`는 유지한다.
- 루트 `.dockerignore`로 `node_modules`, `web/`, `.env`, `.git`을 build에서 뺀다.
- shared를 고쳤을 때: web은 `pnpm -F @memo/shared dev`(watch build)로 반영하고, server 컨테이너는 `docker compose up -d --build server`로 다시 build한다.
- README와 HANDOFF.md의 실행 명령을 pnpm 기준으로 고친다.
- worktree와 원래 폴더는 같은 Docker 포트(5433, 3000)를 쓰므로 한 번에 한 폴더의 stack만 띄운다. worktree 폴더는 compose project 이름이 달라 DB volume이 따로 생긴다.

## 6. 검증

| 대상 | 확인할 것 |
| --- | --- |
| shared | schema 단위 테스트: 칸 값, 공백뿐인 입력, 앞뒤 공백 제거, 한글 200/201자, 이모지 200/201자, 문자열이 아닌 값, 한국어 오류 문구, 칸 이동 body. build 결과에 CJS·ESM·타입 선언이 모두 있음 |
| server | 단위 테스트(규칙 분류기, 적중 집계), 기존 e2e 11개를 수정 없이 통과, build, lint |
| web | build(타입 검사 포함), lint |
| 설치 | `package-lock.json`이 남지 않음, `pnpm install --frozen-lockfile` 통과, Prisma client 생성 확인 |
| Docker | DB volume을 비우고 `docker compose up --build` → API 응답 정상, 빈 메모는 한국어 400, 코드 수정 후 server 프로세스가 하나만 남음 |
| 화면 | 메모 입력 → 칸 배치 → 칸 이동이 이전과 같게 동작 |

## 7. 완료 기준

1. `todo·idea·check·reference` 목록과 응답 타입이 shared에만 정의돼 있다. web과 server를 검색해 다른 정의가 없음을 확인한다.
2. 6절 검증이 모두 통과한다.
3. branch 전체 최종 리뷰를 반영한다.
4. push와 PR 생성은 그 시점에 사용자 승인을 받아 진행한다. PR 본문은 `dev-workflow:merge-request` skill로 작성한다.

## 8. 이번 PR에서 하지 않는 것

- web의 API 응답 검사
- Clef-flash 연결(2단계)
- 1단계 최종 리뷰에서 미뤄 둔 Minor 6건(타입 중복 제외). 예: scaffold 기본 README 정리, NUL 문자 입력이 500으로 응답
- Prisma schema와 DB 구조 변경

## 9. 확인이 필요한 위험

- pnpm 10부터 package의 설치 script를 기본으로 막는다. Prisma처럼 설치 때 엔진을 받는 package는 허용 설정이 필요하고, 로컬 pnpm 12.4.1에서 설정 이름이 바뀌었을 수 있다. 계획에 "설치 후 Prisma client 생성 확인" 단계를 둔다.
- pnpm은 `node_modules`를 엄격하게 연결하므로, npm에서 우연히 동작하던 유령 의존성이 있으면 build가 깨질 수 있다. 깨지면 해당 package를 `package.json`에 명시한다.
- Node 25부터 corepack이 Node에 포함되지 않는다. 로컬은 Homebrew pnpm을 쓰고, Docker(`node:24-bookworm-slim`)는 내장 corepack을 쓴다. 두 버전은 루트 `packageManager` 필드로 맞춘다.

## 10. 후속 작업

이 저장소의 monorepo 목표는 **DTO와 요청·응답 정의를 모두 web·server 공통으로 두어 불필요한 중복을 없애는 것**이다(사용자, 2026-10-05). 이번 PR은 그 첫 단계로 현재 API 3종의 요청·응답 schema와 DTO를 shared로 옮긴다. 아래는 이번 PR에서 하지 않고 뒤로 미룬 작업이다.

- **web의 실행 중 응답 검사**: web이 API 응답을 shared schema로 `parse`해, server가 계약과 다른 모양을 보내면 화면에서 바로 오류로 드러나게 한다. 타입 중복 제거와는 별개의 안전장치다.
- **새 API의 계약은 처음부터 shared에 정의**: 2단계(Clef-flash)에서 바뀌는 `scores`, `대체 규칙` 사유 등은 shared schema를 먼저 고친 뒤 server·web에 반영한다.
