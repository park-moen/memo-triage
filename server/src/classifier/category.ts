import type { Category, ClassifierSource } from '@memo/shared';

export type { Category, ClassifierSource } from '@memo/shared';

export interface ClassifyResult {
  category: Category;
  source: ClassifierSource;
  /** 칸별 확률. Clef-flash만 채운다. */
  scores: Record<Category, number> | null;
  /** 규칙: 일치한 키워드, 대체 시: 마지막 실패 이유 */
  note: string | null;
}

export interface Classifier {
  classify(content: string): Promise<ClassifyResult>;
}

export const CLASSIFIER = Symbol('CLASSIFIER');
