import { z } from 'zod';

export const CATEGORIES = ['todo', 'idea', 'check', 'reference'] as const;
export const CategorySchema = z.enum(CATEGORIES);
export type Category = z.infer<typeof CategorySchema>;

export const CLASSIFIER_SOURCES = ['rule', 'clef-flash'] as const;
export const ClassifierSourceSchema = z.enum(CLASSIFIER_SOURCES);
export type ClassifierSource = z.infer<typeof ClassifierSourceSchema>;

export const MAX_CONTENT_LENGTH = 200;

/** 앞뒤 공백을 지운 뒤 1자 이상, 200자 이하. code point 기준으로 센다(Postgres VARCHAR(200)과 같은 기준). */
export const MemoContentSchema = z
  .string({ error: '메모를 입력해 주세요.' })
  .trim()
  .min(1, { error: '메모를 입력해 주세요.' })
  .refine((content) => [...content].length <= MAX_CONTENT_LENGTH, {
    error: `메모는 ${MAX_CONTENT_LENGTH}자 이하로 입력해 주세요.`,
  });

export const CreateMemoBodySchema = z.object(
  { content: MemoContentSchema },
  { error: '메모를 입력해 주세요.' },
);
export type CreateMemoBody = z.infer<typeof CreateMemoBodySchema>;

export const MoveMemoBodySchema = z.object(
  { category: z.enum(CATEGORIES, { error: '옮길 칸이 올바르지 않습니다.' }) },
  { error: '옮길 칸이 올바르지 않습니다.' },
);
export type MoveMemoBody = z.infer<typeof MoveMemoBodySchema>;

/** 칸별 확률. Clef-flash 분류 결과에만 있다. */
export const ScoresSchema = z.record(CategorySchema, z.number());

export const MemoSchema = z.object({
  id: z.string(),
  content: z.string(),
  modelCategory: CategorySchema,
  finalCategory: CategorySchema,
  scores: ScoresSchema.nullable(),
  note: z.string().nullable(),
  source: ClassifierSourceSchema,
  createdAt: z.string(),
});
export type Memo = z.infer<typeof MemoSchema>;

export const HitCountSchema = z.object({ hit: z.number().int(), total: z.number().int() });
export type HitCount = z.infer<typeof HitCountSchema>;

export const HitStatsSchema = z.object({ rule: HitCountSchema, 'clef-flash': HitCountSchema });
export type HitStats = z.infer<typeof HitStatsSchema>;

export const MemoListResponseSchema = z.object({
  memos: z.array(MemoSchema),
  stats: HitStatsSchema,
});
export type MemoListResponse = z.infer<typeof MemoListResponseSchema>;
