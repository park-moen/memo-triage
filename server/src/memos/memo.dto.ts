import type {
  Category,
  ClassifierSource,
  FallbackReason,
  Memo,
} from '@memo/shared';
import type { Memo as PrismaMemo } from '@prisma/client';

/** 응답 모양은 @memo/shared의 MemoSchema가 정한다. */
export type MemoDto = Memo;

/** DB에는 server만 쓰고, 쓸 때 shared schema와 분류기 결과로 값을 검사하므로 여기서는 형만 맞춘다. */
export function toMemoDto(memo: PrismaMemo): MemoDto {
  return {
    id: memo.id,
    content: memo.content,
    modelCategory: memo.modelCategory as Category,
    finalCategory: memo.finalCategory as Category,
    scores: memo.scores as unknown as Record<Category, number> | null,
    note: memo.note,
    source: memo.source as ClassifierSource,
    fallbackReason: memo.fallbackReason as FallbackReason | null,
    createdAt: memo.createdAt.toISOString(),
  };
}
