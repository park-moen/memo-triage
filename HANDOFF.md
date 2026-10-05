# Clef-flash 사이드 프로젝트 기획 handoff

## 현재 상태

- 이 폴더는 Orca에 `jev-test`로 등록된 임시 작업 공간이다. 프로젝트 주제가 정해지면 사용자가 폴더 이름을 바꿀 예정이다.
- 로컬 Git 저장소만 초기화했다. 원격 저장소, 구현 코드, API 토큰, 배포는 아직 없다.
- 이 문서는 이전 대화에서 보관했던 임시 기획 메모와 이후 논의를 합쳐 옮긴 것이다. 원래 임시 메모는 불러온 뒤 삭제했다.

## 왜 이 프로젝트를 하려는가

사용자는 Jev·Clef가 Codex·Claude Code처럼 코드를 작성하는 에이전트가 아니라, 프로그램 안에서 상황을 받아 정해진 선택지 중 하나를 고르는 판단 모델이라는 점을 이해했다. 분류 API를 수동 호출하는 실험은 모델의 실제 쓰임을 체감하기 어려웠다. 따라서 무료 한도 안에서 Clef-flash가 프로그램의 동작을 바꾸는 작은 사이드 프로젝트를 만들어 보고 싶다.

## 현재 합의와 미결정 사항

- **확정:** Clef-flash를 우선 검토한다. Cloudflare Workers Free의 Workers AI 무료 할당량 안에서 실험하고, 과금 가능성을 통제한다.
- **주제 확정 (2026-10-04):** 메모 분류함. 사용자가 붙여 넣은 메모를 Clef-flash가 정해진 칸 중 하나로 분류해 옮기는 실용 도구다. 비교한 후보는 턴제 대결(적 행동 선택), 흥정 게임(자유 문장에 대한 상인 반응 선택), 메모 분류함 세 가지였다. 분류 API 수동 호출과 비슷해질 수 있다는 위험을 알린 뒤 사용자가 메모 분류함을 골랐다.
- **메모 종류 확정 (2026-10-04):** 업무 중 떠오른 짧은 생각(할 일, 아이디어, 확인할 것 등이 섞인 메모)을 주로 넣는다.
- **분류 기준 확정 (2026-10-04):** 성격 기준으로 `할 일·아이디어·확인할 것·참고` 4칸을 둔다. 메모 문장만 읽고 판단할 수 있어서다. 시간 기준(`오늘·이번 주·언젠가·버림`)은 일정 정보가 없으면 모델이 추측해야 하고, 다음 행동 기준은 사용자가 고르지 않았다.
- **사용 형태 확정 (2026-10-04):** 로컬 웹 페이지. 입력창에 메모를 넣으면 4칸 보드 중 한 곳으로 옮겨지고, 사용자가 직접 다른 칸으로 옮길 수 있다. 터미널 CLI는 칸이 옮겨지는 모습이 보이지 않아 고르지 않았다. Slack·Notion 연동은 외부 토큰이 필요해 범위에서 뺐다.
- **설계 1/3 승인 (2026-10-04) — 사용 흐름과 모델 판단:**
  - 메모 한 줄(최대 200자)을 넣으면 Clef-flash가 4칸 중 하나와 한 문장 이유를 돌려주고, 카드에 이유와 판단 출처(`Clef-flash`/`대체 규칙`)를 표시한다.
  - 사용자가 카드를 다른 칸으로 옮길 수 있고, 프로그램은 모델이 고른 칸과 최종 칸을 비교해 적중 횟수를 보여준다.
  - ~~메모는 브라우저 `localStorage`에 저장한다.~~ → 서버의 Postgres에 저장하는 것으로 바뀜(아래 저장소·배포 순서 참고).
  - 모델 입력은 메모 원문과 칸별 한 줄 정의뿐이며 이전 메모는 보내지 않는다. 글자 수 제한, 응답 검사, 저장·이동, 적중 계산은 프로그램이 맡는다.
- ~~저장 위치: 1단계 `localStorage`, 나중에 D1~~ → 아래 결정으로 대체됨.
- **저장소·배포 순서 확정 (2026-10-04):** 1단계는 Docker Compose로 NestJS와 Postgres를 로컬에서 실행한다. 배포 단계에서 DB를 Supabase Free로 옮기고 호스팅을 정한다. 사용자가 Docker + Supabase + Railway를 제안했고, 아래 이유로 배포를 1단계에서 뺐다.
  - Supabase Free: DB 500MB, 프로젝트 2개, 7일 비활성 시 일시 정지(조사일 2026-10-04).
  - 사용자의 Railway Hobby는 해지했고 사용자 기억으로는 10월 25일까지 유지된다(계정에서 확인하지 않음). 이후 Free 플랜은 월 $1 크레딧·0.5GB RAM이라 상시 실행 서버에는 부족할 수 있다.
  - 대안: Render Free(15분 무요청 시 잠듦, 깨어나는 데 약 1분), Koyeb(무료 1개, 2026-02부터 카드 등록 필요).
  - 배포 시 `/api/classify`가 공개되면 Workers AI 한도를 남이 소모할 수 있으므로 접근 제한·호출 횟수 제한이 필요하다.
- **BE 기술 확정 (2026-10-04):** NestJS. 처음 제안한 Cloudflare Worker + Hono 대신 사용자가 일반적인 Node BE 구조를 골랐다. 그 결과 Clef-flash는 Workers AI binding이 아니라 REST API로 호출하고, 2단계에서 Workers AI용 API 토큰을 새로 만들어야 한다(생성 전 사용자 확인 필수). Kotlin + Spring Boot는 규모가 커서 고르지 않았다.
- **설계 2/3 승인 (2026-10-04) — 구조와 기술:**
  - `web/`: React + TypeScript + Vite, Docker 밖에서 `npm run dev`, `/api`는 Vite proxy로 server에 넘김.
  - `server/`: NestJS + Prisma, Docker 컨테이너. `db`: Postgres 컨테이너. `docker compose up`으로 server와 db를 함께 실행.
  - API: `GET /api/memos`(목록), `POST /api/memos`(저장 + 분류 1회), `PATCH /api/memos/:id`(칸 이동).
  - 테이블 `memos`: `id`, `content`(200자 이하), `model_category`, `final_category`, ~~`reason`~~ `scores`·`note`, `source`(`clef-flash`/`rule`), `created_at`. 적중 = `model_category`와 `final_category`가 같은 메모 수.
  - 순서: 1단계 규칙 분류기로 완성(비용 0) → 2단계 Clef-flash REST 연결(토큰 생성 전 확인) → 배포 단계 별도 결정.
- **설계 3/3 승인 (2026-10-04) — 비용·실패 처리와 완료 기준:**
  - 모델 호출은 메모 1개당 최대 3번(첫 호출 + 재시도 2번). 사용자가 1번에서 상향했다. 근거: 로컬 실행, 혼자 또는 팀원 소수 테스트, 하루 무료 할당량 안에서 감당 가능.
  - 재시도 대상: 시간 초과(호출당 5초), 네트워크 오류, 4칸이 아닌 응답. 재시도하지 않음: 인증 오류, 하루 상한 도달.
  - `CLEF_DAILY_LIMIT`(처음 100)은 재시도를 포함한 실제 호출 수로 server가 DB에 센다. 3번 모두 실패하거나 상한이면 규칙 분류기로 대체하고 카드에 `대체 규칙`과 마지막 실패 이유를 표시한다.
  - DB·server 오류 시 화면에 오류를 보여주고 입력한 메모는 입력창에 남긴다.
  - 적중 횟수는 출처별로 표시한다(예: `Clef-flash 18/20 · 규칙 6/10`).
  - 1단계 완료: `docker compose up`과 `npm run dev`만으로 실행, 입력 → 배치 → 이동 → 새로고침 후 유지, 적중 횟수 정확, 규칙 분류기 단위 테스트와 API 3개 테스트 통과.
  - 2단계 완료: 카드에 Clef-flash 판단과 이유 표시, 모델 실패·상한 도달을 일부러 만들면 대체 규칙으로 이어짐, 토큰이 Git에 들어가지 않음.
- **2단계 전에 확인할 것:**
  - ~~무료 할당량 단위, Clef-flash 모델 ID~~ → 2026-10-04 공식 문서로 확인함(아래 "공식 문서 확인 결과").
  - 팀원 공유 방식. 로컬 실행이면 같은 API 토큰을 나눠 쓰게 될 수 있어 2단계 이후 따로 정한다.
- **공식 문서 확인 결과 (2026-10-04, developers.cloudflare.com/workers-ai):**
  - 무료 할당량은 하루 10,000 Neuron이다. Neuron은 요청에 드는 GPU 연산량을 재는 단위이고 모델마다 소모량이 다르다.
  - REST 호출 형식: `POST https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/ai/run/{model}`, `Authorization: Bearer {API_TOKEN}`. 토큰 권한은 `Workers AI - Read`, `Workers AI - Edit`.
  - Clef-flash 모델 ID는 `@cf/cloudflare/clef-flash`(9B), 상위 모델 `clef`(27B)도 있다. 입력 $0.09 / 1M token, context window 65,536 token.
  - **모델 확정 (2026-10-04):** `@cf/cloudflare/clef-flash`(9B)를 쓴다. 사용자가 가성비를 근거로 골랐다. 27B `clef`는 Clef-flash 적중률이 실제로 낮을 때만 따로 검토한다.
  - **설계 영향:** Clef-flash는 문장을 생성하지 않고, 질문 schema의 선택지별 확률을 돌려준다. 승인된 설계의 "칸 하나 + 한 문장 이유"는 이 출력과 맞지 않았다.
  - **결정 (2026-10-04):** 이유 문장을 빼고 카드에 4칸의 확률 막대를 표시한다. server가 최고 확률 칸을 고른다. 규칙 분류기는 확률 없이 일치한 키워드를 `note`로 남긴다. 테이블 `memos`의 `reason` 열은 `scores`(JSON)와 `note`로 바뀌었다. 문장 생성 모델을 한 번 더 부르는 안은 호출 수가 늘어 고르지 않았다.
  - 무료 할당량이 REST 호출에도 똑같이 적용되는지는 문서에 명시돼 있지 않다. 2단계 연결 전에 대시보드로 확인한다.
- **원격 저장소 (2026-10-04):** `origin` = `https://github.com/park-moen/memo-triage.git`(사용자 요청으로 어시스턴트가 `git remote add`만 실행, 사용자 승인 후 `main`만 push). 저장소 local Git 사용자는 `park-moen <57402711+park-moen@users.noreply.github.com>`. 기존 commit 6개의 작성자를 이 주소로 다시 써서 SHA가 바뀌었고, `main`은 `--force-with-lease`로 다시 push했다. 이후 push 등 원격 변경은 매번 사용자 승인을 받는다.
- **branch 운영 변경 (2026-10-04):** 1인 사이드 프로젝트이고 PR 리뷰·CI가 없어 `main`에서 직접 작업한다. `feat/memo-classifier-stage1`(5646142)을 `main`에 fast-forward로 합치고 push한 뒤, 로컬·원격 branch를 모두 삭제했다. 체크포인트 검토는 대화에서 한다. 회사(ITNew) 저장소가 아니므로 commit·MR 작업에는 `itnew-workflow:`가 아니라 `dev-workflow:` skill을 쓴다.
- `PLAN.md`는 선택하지 않은 턴제 대결 후보의 초안이다. 메모 분류함 기획에는 호출 제한·실패 처리 구조만 참고한다.
- **개발 방식:** 먼저 작은 결과물을 만들고, 실제로 부족했던 절차만 나중에 개인 하네스로 묶는다. Superpowers의 문제 탐색·작은 구현·검증 방식은 참고할 수 있다. ITNew Blueprint 전체 흐름이나 여러 skills.sh 스킬을 먼저 통합하는 일은 현재 목표가 아니다. gstack은 실제 화면 QA 등이 필요할 때 검토한다.
- **미결정:** 실제로 넣을 메모의 종류와 쓰임, 분류 칸 구성, 구현 기술, UI 범위, 완료 기준, API 연결 시점.

## 다음 대화에서 할 일

1. ~~후보 비교와 주제 선정~~ 완료 (메모 분류함).
2. ~~설계 1/3·2/3·3/3 승인, 설계 문서 승인~~ 완료 (2026-10-04). 설계 문서: `docs/superpowers/specs/2026-10-04-memo-classifier-design.md`. 아직 commit하지 않음(commit 방식 미결정: `main` 첫 commit 또는 작업 branch, `PLAN.md` 포함 여부).
3. 1단계 구현 계획 작성 완료: `docs/superpowers/plans/2026-10-04-memo-classifier-stage1.md` (Task 0~9, 사용자 검토 대기). 구현은 계획 승인과 실행 방식 선택 뒤에 시작한다.
   - **계획 승인 (2026-10-04):** 사용자가 1,795줄 계획 전문 대신 체크포인트 방식으로 검토하기로 했다. 체크포인트 1은 Task 5 뒤(API 테스트 결과, `curl` 응답, 규칙 분류기 키워드 목록), 체크포인트 2는 Task 8 뒤(화면 직접 확인). 그 사이에는 멈추지 않고 진행한다.
   - 기본값으로 함께 확정: 설계와 다른 4가지(버전 고정, 칸 값 영문 코드, 1단계 배지 `규칙`, Postgres 포트 5433) 수용, 실행 방식 Native(`superpowers:executing-plans`), `main`에 문서 첫 commit 후 `feat/memo-classifier-stage1` branch에서 구현(→ 이후 `main` 직접 작업으로 바뀜, 원격 저장소 항목 아래 참고), `PLAN.md`는 commit하지 않고 그대로 둔다. 계획은 검증된 버전으로 고정했다: `@nestjs/cli@11.0.24`, `prisma@6.19.3`, `create-vite@9.2.1`, `postgres:17`(최신 NestJS 12·Prisma 7/8-rc·TypeScript 7은 2026-08 이후 출시라 제외). Postgres 호스트 포트는 5433.
3-1. **1단계 완료 (2026-10-04, `main`):** Task 0~9와 최종 리뷰 반영까지 끝났다. commit: f204109(문서), 559e6f2(Postgres), 1b43892(NestJS·Prisma), 39d2316(규칙 분류기), 237f7f9(입력 검사·적중 집계), 402f398(API 3종), 69eaf91(server Docker), 5f34213(web·API client), 973055a(보드 화면), 4d68c24(README), 754c2ff(처리하지 못한 오류를 한국어 500으로), c2346ff(Docker 재시작 시 이전 프로세스가 남던 문제, procps 추가) — 작성자 변경 전 SHA는 aee6dd0·9764519·d6928b7·f164fec·3edf6eb·2a9e6da. 단위 29개·e2e 11개 통과. 69eaf91 이후 commit은 아직 push하지 않았다.
   - 최종 리뷰(새 context reviewer): Critical 0, Important 2(둘 다 반영), Minor 7(미뤄 둠). 2단계와 관련 있는 미룬 항목: 분류 중 입력창에 새로 친 글이 저장 성공 시 지워짐(2단계는 최대 15초), 카드에 확률 막대와 `대체 규칙` 배지 표시 필요, web과 server의 `Category`·`HitStats` 타입 중복. 그 밖: NUL·짝 없는 surrogate 입력이 400이 아니라 500, 칸 이동 select가 목록 갱신 전까지 원래 값으로 돌아감, `server/README.md`·`web/README.md` scaffold 기본 문서가 남아 있음, 루트 README에 package.json 변경 시 `--build` 안내 없음.
3-2. **branch 운영 결정 (2026-10-04):** 1단계(리뷰 지적 반영 포함)까지는 `main`에서 바로 작업한다. 2단계부터는 작업 branch를 만들고 GitHub PR로 합친다. `push`와 PR 생성은 그 시점마다 사용자 승인을 받는다. Docker 포트(5433, 3000)가 겹치므로 별도 worktree 대신 이 폴더에서 branch를 바꿔 작업한다. → **2026-10-05 변경:** 사용자가 superpowers의 여러 작업 방식을 써 보기로 해서, 공유 schema 작업은 `superpowers:using-git-worktrees`로 만든 worktree에서 `superpowers:subagent-driven-development`로 진행한다. Docker 포트 충돌은 "한 번에 한 폴더의 stack만 띄운다"로 피한다(worktree 폴더는 compose project 이름이 달라 DB volume도 따로 생긴다).
3-3. **공유 schema 결정 (2026-10-04):** web과 server에 중복된 타입(`Category`, `MemoDto`, `HitStats`)은 2단계 전에 별도 branch·PR로 해결한다. npm workspaces의 `packages/shared`에 zod schema를 두고 server 입력 검사와 web 응답 타입이 함께 쓰는 방향을 검토한다. 중복은 Prisma 때문이 아니라 web과 server가 코드를 공유하지 않는 별개 프로젝트이기 때문이라, ORM 교체(Drizzle 등)는 하지 않는다. 시작은 사용자가 `main`을 push한 뒤 `brainstorming`부터 한다.
3-4. **공유 schema 설계 진행 (2026-10-05, brainstorming architectural 경로):** `main` push 확인(0fae484). 확정: zod는 타입 공유 + server 입력 검사에 쓰고 web은 타입만 가져다 쓴다(web 응답 검사는 하지 않음). 공유 방식은 workspaces + build(`tsup`으로 CJS·ESM 동시 build) — server(CommonJS)와 web(ESM)의 모듈 방식 차이와 Docker build 범위(`./server`만 봄) 때문이다. package manager는 npm에서 pnpm workspaces로 바꾼다(사용자 제안, 엄격한 의존성·`workspace:*`·`--filter`). 로컬 pnpm 12.4.1, Docker는 corepack으로 버전 고정. pnpm 10+의 설치 script 차단 설정(Prisma)은 pnpm 12에서 검증 필요.
   - **설계 1/3 승인 (2026-10-05):** 루트 `package.json`(packageManager 고정)·`pnpm-workspace.yaml`(server, web, packages/*)·`pnpm-lock.yaml` 하나. 새 package `@memo/shared`(zod schema, tsup build)를 server·web이 `workspace:*`로 의존. 공유: `CategorySchema`, `ClassifierSourceSchema`, 메모 내용 규칙(trim, 1~200 code point, 한국어 오류 문구 포함)·칸 이동 body, `MemoSchema`, `HitStatsSchema`, 목록 응답, 타입은 모두 `z.infer`. 공유하지 않음: server 내부 `ClassifyResult`·`Classifier`·`CLASSIFIER`, web 화면 문구 `CATEGORY_LABELS`·`SOURCE_LABELS`, Prisma schema.
   - **진행 방식 확정 (2026-10-05):** 작업 공간 worktree, 실행 방식 subagent-driven(사용자 선택, 추천과 같음). 병렬 subagent는 Task 의존 관계 때문에 쓰지 않는다.
   - **설계 2/3 승인 (2026-10-05):** server는 `parseContent`·`parseCategory` 대신 controller에서 `parseWith(schema, body)`로 검사하고 첫 한국어 문구로 400. 타입은 shared에서 가져오고 `ClassifyResult`·`Classifier`·`toMemoDto`만 server에 남김. 입력 규칙 단위 테스트는 shared로 옮기고 server e2e 11개는 그대로 둔다. web은 `api.ts` 타입 선언 삭제, `CATEGORIES`·`MAX_CONTENT_LENGTH`도 shared 값 사용(번들에 zod 포함 허용), 화면 문구는 web 유지. Docker build context를 루트로, corepack pnpm, 루트 `.dockerignore`. shared 변경 시 web은 `pnpm -F @memo/shared dev`, server 컨테이너는 `--build`. README·HANDOFF의 명령을 pnpm 기준으로 고친다.
   - **설계 3/3 승인 (2026-10-05):** 검증(shared 단위·build 산출물, server 단위·e2e 11개 무수정 통과·build·lint, web build·lint, pnpm frozen install·Prisma client 생성, Docker 처음부터 build, 화면)과 완료 기준(칸 목록·응답 타입이 shared에만 존재, 최종 리뷰 반영, push·PR은 그때 승인). 설계 문서: `docs/superpowers/specs/2026-10-05-shared-schema-design.md` — **2026-10-05 사용자 승인**(commit 전, worktree branch 첫 commit에 포함 예정). 다음: `writing-plans`로 구현 계획.
   - **monorepo 목표와 후속 작업 (2026-10-05, 사용자):** 최종 목표는 DTO와 요청·응답 정의를 모두 web·server 공통으로 두어 중복을 없애는 것. 이번 PR은 현재 API 3종의 요청·응답 schema와 DTO를 shared로 옮기는 첫 단계다. 후속: web의 실행 중 응답 검사, 2단계의 새 계약(`scores` 등)은 shared부터 정의. 설계 문서 10절에 기록.
   - **구현 계획 작성 (2026-10-05):** `docs/superpowers/plans/2026-10-05-shared-schema.md`(Task 0~6, 사용자 검토 대기). 계획 전 scratchpad 실험으로 확인: pnpm 12는 막힌 설치 script를 `ERR_PNPM_IGNORED_BUILDS` 오류로 멈추고 `pnpm approve-builds`가 `pnpm-workspace.yaml`의 `allowBuilds`에 기록한다. tsup build 결과는 CJS `require`·ESM `import`·`nodenext` 타입 검사에서 모두 동작한다. zod 4의 `{ error }` 문구 지정이 의도대로 나온다. `node:24-bookworm-slim`의 corepack으로 pnpm 12.4.1을 받을 수 있다. branch 이름은 `refactor/shared-zod-schema`.
3-5. **공유 schema 구현 진행 (2026-10-05):** 계획 승인. 실행 위치를 Orca worktree `~/orca/workspaces/jev-test/shared-zod-schema`(branch `refactor/shared-zod-schema`, base `main` 0fae484)로 옮겼다. 처음 만든 harness worktree(`.claude/worktrees/…`)는 이 저장소의 Orca 설정이 외부 worktree를 숨겨(`externalWorktreeVisibility: hide`) 화면에 보이지 않아, 사용자 승인 아래 지우고 옮겼다. 실행 방식은 `superpowers:subagent-driven-development`이고 Task 사이에 멈추지 않는다(사용자가 Task별 체크포인트를 철회). 처음 세션은 `main` 폴더 터미널에서 시작돼 Orca의 `main` 카드에 표시되므로, 사용자 요청으로 남은 작업을 worktree 카드 터미널의 새 Claude 세션에 넘긴다.
   - 진행: Task 0(ca56f1e 문서), Task 1(a4bedbb pnpm 전환, 리뷰 통과) 완료. 진행 ledger(Git 제외): `.superpowers/sdd/2026-10-05-shared-schema/progress.md` — Task 완료 줄, `Ruling:` 줄, 브리프·리포트·리뷰 파일이 모두 여기 있다.
4. 실제 구현 과정에서 겪은 불편을 기록해 Superpowers·gstack·개인 하네스 중 무엇이 필요한지 나중에 판단한다.

## 보안·비용 경계

- 이전 Clef-flash API 토큰과 임시 실행기는 삭제됐다. 토큰 값을 문서·Git·handoff에 기록하지 않는다.
- Cloudflare 계정에는 Workers Free 외에 R2 Paid 등 별도 상품이 있었으므로, 계정 전체가 무료라고 가정하지 않는다. Workers AI 사용량과 다른 서비스 비용을 구분한다.
- 새 토큰 생성, 유료 플랜 전환, 원격 저장소 생성·연결, push, 배포는 기획 내용에 포함되지 않으며 각각 필요해질 때 사용자와 확인한다.

## 받는 작업 공간에 요청하는 첫 행동

현재 단계는 **공유 zod schema 구현(subagent-driven) 진행 중**이다. 이 worktree(`~/orca/workspaces/jev-test/shared-zod-schema`)에서:

1. 이 문서, 설계(`docs/superpowers/specs/2026-10-05-shared-schema-design.md`), 계획(`docs/superpowers/plans/2026-10-05-shared-schema.md`), ledger(`.superpowers/sdd/2026-10-05-shared-schema/progress.md`)를 읽는다.
2. `superpowers:subagent-driven-development`를 불러, ledger에 `Task N: complete`가 없는 첫 Task부터 이어서 진행한다. 완료된 Task를 다시 돌리지 않는다.
3. Task 사이에 멈추지 않는다. 최종 리뷰까지 마친 뒤 `superpowers:finishing-a-development-branch`에서 push와 PR 생성 승인을 요청하고, ledger의 `Ruling:` 줄을 모두 모아 보고한다.
4. 원래 `main` 폴더(`~/Desktop/mjpark/jev-test`)의 Docker stack은 내려가 있다. Docker는 이 worktree에서만 띄운다. 무관한 `ieve-mariadb` 컨테이너는 건드리지 않는다.
