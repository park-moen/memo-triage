import { startOfUtcDay } from './clef-call-log';

describe('startOfUtcDay', () => {
  it('UTC 자정으로 내린다 (한국 시간 오전 9시 전후)', () => {
    expect(startOfUtcDay(new Date('2026-10-05T08:59:59Z')).toISOString()).toBe(
      '2026-10-05T00:00:00.000Z',
    );
    expect(startOfUtcDay(new Date('2026-10-05T00:00:00Z')).toISOString()).toBe(
      '2026-10-05T00:00:00.000Z',
    );
    expect(startOfUtcDay(new Date('2026-10-04T23:59:59Z')).toISOString()).toBe(
      '2026-10-04T00:00:00.000Z',
    );
  });
});
