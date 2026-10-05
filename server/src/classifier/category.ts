import type { Category, ClassifierSource, FallbackReason } from '@memo/shared';

export type { Category, ClassifierSource, FallbackReason } from '@memo/shared';

export interface ClassifyResult {
  category: Category;
  source: ClassifierSource;
  /** 칸별 확률. Clef-flash만 채운다. */
  scores: Record<Category, number> | null;
  /** 규칙 분류기의 근거(일치한 키워드). Clef-flash 결과는 null이다. */
  note: string | null;
  /** Clef-flash 대신 규칙으로 분류한 이유. 대체가 아니면 null이다. */
  fallbackReason: FallbackReason | null;
}

export interface Classifier {
  classify(content: string): Promise<ClassifyResult>;
}

export const CLASSIFIER = Symbol('CLASSIFIER');
