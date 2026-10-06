import { Injectable } from '@nestjs/common';
import { Category, Classifier, ClassifyResult } from './category';

/** 앞에 있는 규칙이 우선한다. */
const RULES: ReadonlyArray<{
  category: Category;
  keywords: readonly string[];
}> = [
  {
    category: 'check',
    keywords: ['확인', '문의', '물어', '알아보', '찾아보', '?', '？'],
  },
  {
    category: 'idea',
    keywords: ['아이디어', '어떨까', '하면 좋', '해보면', '개선'],
  },
  {
    category: 'todo',
    keywords: ['해야', '처리', '수정', '작성', '보내', '제출', '하기'],
  },
];

export function classifyByRules(content: string): ClassifyResult {
  for (const rule of RULES) {
    const matched = rule.keywords.find((keyword) => content.includes(keyword));
    if (matched) {
      return {
        category: rule.category,
        source: 'rule',
        scores: null,
        note: `키워드 '${matched}' 일치`,
        fallbackReason: null,
      };
    }
  }
  return {
    category: 'reference',
    source: 'rule',
    scores: null,
    note: '일치한 키워드 없음',
    fallbackReason: null,
  };
}

@Injectable()
export class RuleClassifier implements Classifier {
  classify(content: string): Promise<ClassifyResult> {
    return Promise.resolve(classifyByRules(content));
  }
}
