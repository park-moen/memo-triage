# 메모 분류함 설계

- 작성일: 2026-10-04
- 상태: 설계 승인 완료, 문서 검토 대기
- 배경: `HANDOFF.md`의 Clef-flash 사이드 프로젝트. 주제 후보 3개(턴제 대결, 흥정 게임, 메모 분류함) 중 메모 분류함을 골랐다.

## 1. 목적

Clef-flash가 정해진 선택지 중 하나를 고르는 판단 모델로서 프로그램의 동작을 바꾸는 모습을 직접 체감한다. 업무 중 떠오른 짧은 메모를 넣으면 Clef-flash가 칸별 확률을 내고, 사용자가 그 판단을 고치면서 모델이 얼마나 맞았는지 숫자로 확인한다.

## 2. 사용 흐름

1. 입력창에 메모 한 줄(최대 200자)을 넣고 분류를 누른다.
2. server가 메모와 4칸 선택지를 Clef-flash에 보내고, 모델은 칸별 확률을 돌려준다. server는 확률이 가장 높은 칸을 고른다.
3. 메모 카드가 그 칸에 들어가며, 카드에는 4칸의 확률 막대와 판단 출처(`Clef-flash` 또는 `대체 규칙`)가 표시된다.
4. 분류가 틀렸다고 보면 카드 위 메뉴로 다른 칸을 고른다. 드래그 앤 드롭은 첫 버전에 넣지 않는다.
5. 화면은 출처별 적중 횟수를 보여준다. 예: `Clef-flash 18/20 · 규칙 6/10`.

## 3. 분류 칸

| 칸 | 정의 (모델에 보내는 선택지 설명) |
| --- | --- |
| `할 일` | 내가 직접 해야 하는 작업 |
| `아이디어` | 해 볼 만한 생각이나 개선안 |
| `확인할 것` | 누군가에게 묻거나 찾아봐야 하는 것 |
| `참고` | 행동 없이 알아만 두면 되는 정보 |

성격 기준으로 나눈 이유: 메모 문장만 읽고 판단할 수 있다. 시간 기준(`오늘·이번 주·언젠가·버림`)은 일정 정보가 없어 모델이 추측해야 한다.

## 4. 역할 나누기

- **Clef-flash** (`@cf/cloudflare/clef-flash`, 9B): 메모 원문을 state로, "이 메모는 어느 칸인가"를 선택형 질문 하나로 받아 4칸의 확률을 돌려준다. 문장을 생성하지 않는다. 이전 메모는 보내지 않는다.
- **server**: 글자 수 제한, 응답 형식 검사, 최고 확률 칸 선택, 재시도와 하루 상한, 대체 규칙 전환, 저장, 적중 계산을 맡는다.
- **규칙 분류기**: 키워드로 칸을 고르고, 일치한 키워드를 근거로 남긴다. 확률은 내지 않는다. 1단계의 기본 분류기이자 2단계의 대체 분류기다.

두 분류기는 같은 형식을 따른다.

```ts
type Category = '할 일' | '아이디어' | '확인할 것' | '참고';
type ClassifyResult = {
  category: Category;
  source: 'clef-flash' | 'rule';
  scores: Record<Category, number> | null; // Clef-flash만 채운다
  note: string | null;                      // 규칙: 일치한 키워드, 대체 시: 마지막 실패 이유
};
```

## 5. 구조

```
web (Vite, Docker 밖) ── /api (Vite proxy) ──▶ server (NestJS, Docker) ──▶ db (Postgres, Docker)
                                                   ├─▶ Clef-flash (Workers AI REST API, 2단계)
                                                   └─▶ 규칙 분류기
```

- `web/`: React + TypeScript + Vite. 화면 수정이 바로 반영되도록 Docker 밖에서 `npm run dev`로 실행한다.
- `server/`: NestJS + Prisma. Docker 컨테이너에서 실행한다.
- `db`: Postgres 컨테이너. `docker compose up`으로 server와 함께 실행한다.
- BE로 Cloudflare Worker + Hono도 검토했다. Workers AI를 API 토큰 없이 binding으로 부를 수 있지만, 사용자가 일반적인 Node BE 구조인 NestJS를 골랐다. 그래서 Clef-flash는 REST API와 API 토큰으로 호출한다. 연결 방법만 다를 뿐 모델은 Workers AI에서 실행되므로 Workers AI 무료 할당량이 그대로 적용된다.

### API

| 요청 | 하는 일 |
| --- | --- |
| `GET /api/memos` | 메모 목록과 출처별 적중 횟수 조회 |
| `POST /api/memos` | 메모 저장 + 분류 |
| `PATCH /api/memos/:id` | 사용자가 칸 이동 (`final_category` 변경) |

### 테이블 `memos`

| 열 | 설명 |
| --- | --- |
| `id` | 기본 키 |
| `content` | 메모 원문, 200자 이하 |
| `model_category` | 분류기가 처음 고른 칸. 바뀌지 않는다 |
| `final_category` | 현재 칸. 처음에는 `model_category`와 같다 |
| `scores` | 칸별 확률(JSON). 규칙 분류기면 비어 있다 |
| `note` | 규칙 분류기의 일치 키워드, 또는 대체했을 때의 마지막 실패 이유 |
| `source` | `clef-flash` 또는 `rule` |
| `created_at` | 생성 시각 |

적중 = `model_category`와 `final_category`가 같은 메모 수. `source`별로 나눠 센다.

하루 호출 수를 세기 위한 저장소(테이블 또는 행)는 2단계 구현 계획에서 정한다.

## 6. 비용 통제 (2단계)

1. 모델 호출은 메모 1개당 최대 3번(첫 호출 + 재시도 2번)이다.
   - 재시도함: 시간 초과(호출당 5초), 네트워크 오류, 형식이 맞지 않는 응답(확률이 빠지거나 칸 이름이 다름)
   - 재시도하지 않음: 인증 오류, 하루 상한 도달
2. `CLEF_DAILY_LIMIT`(처음 값 100)은 재시도를 포함한 실제 호출 수로 server가 DB에 센다. 상한에 닿으면 그날은 모델을 부르지 않는다.
3. 입력 200자 제한으로 호출 1번의 사용량을 예측 가능하게 한다.
4. 무료 할당량은 하루 10,000 Neuron이다(2026-10-04 공식 문서 기준). Neuron은 요청에 드는 GPU 연산량을 재는 단위로, 모델마다 소모량이 다르다. 연결 전에 대시보드에서 실제 소모량을 확인하고 `CLEF_DAILY_LIMIT`을 조정한다.

## 7. 실패 처리

- 3번 모두 실패하거나 하루 상한에 닿으면 규칙 분류기로 분류하고, 카드에 `대체 규칙`과 마지막 실패 이유를 표시한다.
- 분류에는 최악의 경우 15초가 걸릴 수 있으므로, 그동안 카드에 "분류 중"을 표시한다.
- DB나 server 오류가 나면 화면에 오류를 보여주고, 입력한 메모는 입력창에 남긴다.

## 8. 단계와 완료 기준

| 단계 | 범위 | 완료 기준 |
| --- | --- | --- |
| 1단계 | web, server, db, 규칙 분류기. 외부 계정·토큰·모델 호출 없음 | `docker compose up`과 `npm run dev`만으로 실행된다. 입력 → 배치 → 이동 → 새로고침 후 유지가 동작하고 적중 횟수가 맞다. 규칙 분류기 단위 테스트와 API 3개의 테스트가 통과한다 |
| 2단계 | Clef-flash 분류기, 재시도, 하루 상한 | 카드에 Clef-flash의 칸별 확률이 나온다. 모델 실패와 상한 도달을 일부러 만들면 대체 규칙으로 이어진다. API 토큰이 Git에 들어가지 않는다 |
| 배포 단계 | 별도 결정 | DB를 Supabase Free로 옮기고 호스팅과 `/api` 접근 제한을 정한다 |

## 9. MVP 다음 후보

1단계·2단계를 마친 뒤 고를 수 있는 작업 목록이다. 할지 말지는 그때 정하며, MVP 코드를 이 항목들에 미리 맞춰 설계하지 않는다.

- 배포 (8절의 배포 단계)
- 계정·로그인, 여러 사용자 (팀원 공유 방식과 함께 정한다)
- 드래그 앤 드롭, 메모 수정·삭제, 검색
- Slack·Notion 연동
- 27B `clef`와 적중률 비교 (Clef-flash 적중률이 실제로 낮을 때)

## 10. 하지 않기로 한 것

- 모델이 쓴 분류 이유 문장. Clef-flash는 문장을 생성하지 않고, 이유를 만들려고 다른 모델을 한 번 더 부르면 호출 수가 늘어난다. 카드에는 칸별 확률을 대신 표시한다.

## 11. 사용자 확인이 필요한 작업

- Workers AI API 토큰 생성(2단계 시작 전). 필요한 권한은 `Workers AI - Read`, `Workers AI - Edit`이다. 토큰은 `server/.env`에만 두고 `.gitignore`로 제외한다.
- Supabase 프로젝트 생성, 호스팅 가입, 유료 플랜 전환(배포 단계).
- 개인 GitHub 원격 저장소 연결과 push는 사용자가 직접 한다. 첫 push 전에 `.gitignore`가 `.env`를 제외하는지 확인한다.

## 12. 2단계 전에 확인할 것

- 하루 10,000 Neuron 무료 할당량이 REST 호출에도 똑같이 적용되는지. 공식 문서에 명시돼 있지 않다.
- Clef-flash 요청 본문의 정확한 형식(state와 질문 schema를 쓰는 방법)과 응답 JSON 모양.
- 팀원과 공유하는 방식. 로컬 실행이면 같은 API 토큰을 나눠 쓰게 될 수 있다.

## 참고 자료

- Workers AI 요금: https://developers.cloudflare.com/workers-ai/platform/pricing/
- Workers AI REST API 시작하기: https://developers.cloudflare.com/workers-ai/get-started/rest-api/
- Clef-flash 모델: https://developers.cloudflare.com/workers-ai/models/clef-flash/
