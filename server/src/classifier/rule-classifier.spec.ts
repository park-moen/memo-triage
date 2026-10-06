import { classifyByRules, RuleClassifier } from './rule-classifier';

describe('classifyByRules', () => {
  it.each([
    ['배포 일정 PM한테 확인', 'check', "키워드 '확인' 일치"],
    ['이 API 왜 느리지?', 'check', "키워드 '?' 일치"],
    ['온보딩 문서를 영상으로 만들면 어떨까', 'idea', "키워드 '어떨까' 일치"],
    ['금요일까지 회의록 작성', 'todo', "키워드 '작성' 일치"],
    ['Node 24가 현재 LTS', 'reference', '일치한 키워드 없음'],
  ])('"%s" → %s', (content, category, note) => {
    expect(classifyByRules(content)).toEqual({
      category,
      source: 'rule',
      scores: null,
      note,
      fallbackReason: null,
    });
  });

  it('여러 칸의 키워드가 함께 있으면 확인할 것 → 아이디어 → 할 일 순서로 고른다', () => {
    expect(classifyByRules('수정 방향 확인').category).toBe('check');
    expect(classifyByRules('개선안 작성').category).toBe('idea');
  });
});

describe('RuleClassifier', () => {
  it('classify는 classifyByRules 결과를 Promise로 돌려준다', async () => {
    await expect(new RuleClassifier().classify('회의록 작성')).resolves.toEqual(
      classifyByRules('회의록 작성'),
    );
  });
});
