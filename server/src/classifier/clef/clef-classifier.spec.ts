import { ClefClassifier, type FetchLike } from './clef-classifier';
import type { ClefConfig } from './clef-config';

const config: ClefConfig = {
  accountId: 'acc-1',
  apiToken: 'tok-1',
  dailyLimit: 100,
};

const okBody = {
  result: {
    model: 'clef-flash',
    answers: {
      category: {
        type: 'choice',
        choice: 'check',
        probabilities: {
          todo: 0.1477,
          idea: 0.0151,
          check: 0.7676,
          reference: 0.0696,
        },
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
      new Response(typeof body === 'string' ? body : JSON.stringify(body), {
        status,
      }),
    );
}

describe('ClefClassifier.classifyOnce', () => {
  it('성공하면 choice를 칸으로, probabilities를 scores로 돌려준다', async () => {
    const result = await new ClefClassifier(
      config,
      respond(200, okBody),
    ).classifyOnce('배포 일정 PM한테 확인');
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
    const result = await new ClefClassifier(
      config,
      respond(status, { success: false }),
    ).classifyOnce('메모');
    expect(result).toEqual({ ok: false, reason, retryable });
  });

  it('연결 실패는 network(재시도)', async () => {
    const fetchFn: FetchLike = () =>
      Promise.reject(new TypeError('fetch failed'));
    expect(
      await new ClefClassifier(config, fetchFn).classifyOnce('메모'),
    ).toEqual({
      ok: false,
      reason: 'network',
      retryable: true,
    });
  });

  it('시간 제한을 넘기면 요청을 끊고 timeout(재시도)', async () => {
    const fetchFn: FetchLike = (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () =>
          reject(new DOMException('aborted', 'AbortError')),
        );
      });
    expect(
      await new ClefClassifier(config, fetchFn, 20).classifyOnce('메모'),
    ).toEqual({
      ok: false,
      reason: 'timeout',
      retryable: true,
    });
  });

  it.each([
    ['success가 false', { ...okBody, success: false }],
    [
      'choice가 4칸이 아님',
      {
        ...okBody,
        result: {
          answers: {
            category: { ...okBody.result.answers.category, choice: 'other' },
          },
        },
      },
    ],
    [
      'probabilities에 칸이 빠짐',
      {
        ...okBody,
        result: {
          answers: {
            category: { choice: 'check', probabilities: { check: 1 } },
          },
        },
      },
    ],
    ['본문이 JSON이 아님', 'not json'],
  ])('200이지만 %s이면 invalid_response(재시도)', async (_name, body) => {
    expect(
      await new ClefClassifier(config, respond(200, body)).classifyOnce('메모'),
    ).toEqual({
      ok: false,
      reason: 'invalid_response',
      retryable: true,
    });
  });
});
