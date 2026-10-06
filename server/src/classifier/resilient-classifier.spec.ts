import type { ClefCallResult, ClefOutcome } from './clef/clef-classifier';
import type { ClefCallLog } from './clef/clef-call-log';
import type { ClefConfig } from './clef/clef-config';
import { ResilientClassifier } from './resilient-classifier';
import { RuleClassifier } from './rule-classifier';

const configured: ClefConfig = {
  accountId: 'a',
  apiToken: 't',
  dailyLimit: 100,
};
const success: ClefCallResult = {
  ok: true,
  category: 'check',
  scores: { todo: 0.1, idea: 0.1, check: 0.7, reference: 0.1 },
};
const fail = (
  reason: 'timeout' | 'network' | 'invalid_response' | 'auth' | 'rate_limited',
  retryable: boolean,
): ClefCallResult => ({
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
    const result = await new ResilientClassifier(
      configured,
      clef,
      log,
      new RuleClassifier(),
    ).classify('배포 일정 확인');
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
    const result = await new ResilientClassifier(
      configured,
      clef,
      log,
      new RuleClassifier(),
    ).classify('메모');
    expect(result.source).toBe('clef-flash');
    expect(log.recorded).toEqual(['timeout', 'success']);
  });

  it('3번 모두 실패하면 규칙으로 대체하고 마지막 실패 이유를 남긴다', async () => {
    const clef = fakeClef([
      fail('timeout', true),
      fail('network', true),
      fail('invalid_response', true),
    ]);
    const log = new FakeLog();
    const result = await new ResilientClassifier(
      configured,
      clef,
      log,
      new RuleClassifier(),
    ).classify('회의록 작성');
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

  it.each([['auth'], ['rate_limited']] as const)(
    '%s는 1번 시도 후 바로 대체한다',
    async (reason) => {
      const clef = fakeClef([fail(reason, false)]);
      const log = new FakeLog();
      const result = await new ResilientClassifier(
        configured,
        clef,
        log,
        new RuleClassifier(),
      ).classify('메모');
      expect(clef.calls).toBe(1);
      expect(result.fallbackReason).toBe(reason);
    },
  );

  it('토큰이 없으면 호출하지 않고 not_configured로 대체한다', async () => {
    const clef = fakeClef([success]);
    const log = new FakeLog();
    const result = await new ResilientClassifier(
      { ...configured, apiToken: '' },
      clef,
      log,
      new RuleClassifier(),
    ).classify('메모');
    expect(clef.calls).toBe(0);
    expect(log.recorded).toEqual([]);
    expect(result.fallbackReason).toBe('not_configured');
  });

  it('오늘 호출이 이미 상한이면 호출하지 않고 daily_limit로 대체한다', async () => {
    const clef = fakeClef([success]);
    const log = new FakeLog(100);
    const result = await new ResilientClassifier(
      configured,
      clef,
      log,
      new RuleClassifier(),
    ).classify('메모');
    expect(clef.calls).toBe(0);
    expect(result.fallbackReason).toBe('daily_limit');
  });

  it('상한 0이면 호출하지 않는다', async () => {
    const clef = fakeClef([success]);
    const result = await new ResilientClassifier(
      { ...configured, dailyLimit: 0 },
      clef,
      new FakeLog(),
      new RuleClassifier(),
    ).classify('메모');
    expect(clef.calls).toBe(0);
    expect(result.fallbackReason).toBe('daily_limit');
  });

  it('시도 중간에 상한에 닿으면 남은 시도를 하지 않고 daily_limit로 대체한다', async () => {
    const clef = fakeClef([fail('timeout', true)]);
    const log = new FakeLog(98);
    const result = await new ResilientClassifier(
      configured,
      clef,
      log,
      new RuleClassifier(),
    ).classify('메모');
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
    await new ResilientClassifier(
      configured,
      fakeClef([success]),
      log,
      new RuleClassifier(),
      () => new Date('2026-10-05T08:30:00Z'),
    ).classify('메모');
    expect(starts[0].toISOString()).toBe('2026-10-05T00:00:00.000Z');
  });
});
