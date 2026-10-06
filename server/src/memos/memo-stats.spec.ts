import { computeHitStats } from './memo-stats';

describe('computeHitStats', () => {
  it('메모가 없으면 모두 0이다', () => {
    expect(computeHitStats([])).toEqual({
      'clef-flash': { hit: 0, total: 0 },
      rule: { hit: 0, total: 0 },
    });
  });

  it('출처별로 처음 칸과 현재 칸이 같은 메모를 적중으로 센다', () => {
    expect(
      computeHitStats([
        { source: 'rule', modelCategory: 'todo', finalCategory: 'todo' },
        { source: 'rule', modelCategory: 'todo', finalCategory: 'idea' },
        {
          source: 'clef-flash',
          modelCategory: 'check',
          finalCategory: 'check',
        },
      ]),
    ).toEqual({
      'clef-flash': { hit: 1, total: 1 },
      rule: { hit: 1, total: 2 },
    });
  });

  it('알 수 없는 출처는 세지 않는다', () => {
    expect(
      computeHitStats([
        { source: 'unknown', modelCategory: 'todo', finalCategory: 'todo' },
      ]).rule.total,
    ).toBe(0);
  });

  it('CLASSIFIER_SOURCES의 모든 출처를 0으로 시작한다', () => {
    expect(Object.keys(computeHitStats([])).sort()).toEqual([
      'clef-flash',
      'rule',
    ]);
  });
});
