import { BadRequestException } from '@nestjs/common';
import type { z } from 'zod';

/** 요청 body를 shared schema로 검사한다. 실패하면 schema에 적힌 첫 번째 한국어 문구로 400을 던진다. */
export function parseWith<T extends z.ZodType>(
  schema: T,
  raw: unknown,
): z.infer<T> {
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new BadRequestException(
      result.error.issues[0]?.message ?? '요청이 올바르지 않습니다.',
    );
  }
  return result.data;
}
