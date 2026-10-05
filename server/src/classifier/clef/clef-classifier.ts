import { CategorySchema, type Category } from '@memo/shared';
import { z } from 'zod';
import type { ClefConfig } from './clef-config';

export type ClefFailureReason =
  'timeout' | 'network' | 'invalid_response' | 'auth' | 'rate_limited';
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
        return failure(
          controller.signal.aborted ? 'timeout' : 'invalid_response',
        );
      }
      const parsed = ClefResponseSchema.safeParse(body);
      if (!parsed.success) return failure('invalid_response');
      const answer = parsed.data.result.answers.category;
      return {
        ok: true,
        category: answer.choice,
        scores: answer.probabilities,
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
