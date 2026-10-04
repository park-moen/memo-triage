import type { Memo } from '@prisma/client';
import { Category, ClassifierSource } from '../classifier/category';

export interface MemoDto {
  id: string;
  content: string;
  modelCategory: Category;
  finalCategory: Category;
  scores: Record<Category, number> | null;
  note: string | null;
  source: ClassifierSource;
  createdAt: string;
}

/** DB에는 server만 쓰고, 쓸 때 parseCategory와 분류기 결과로 값을 검사하므로 여기서는 형만 맞춘다. */
export function toMemoDto(memo: Memo): MemoDto {
  return {
    id: memo.id,
    content: memo.content,
    modelCategory: memo.modelCategory as Category,
    finalCategory: memo.finalCategory as Category,
    scores: memo.scores as unknown as Record<Category, number> | null,
    note: memo.note,
    source: memo.source as ClassifierSource,
    createdAt: memo.createdAt.toISOString(),
  };
}
