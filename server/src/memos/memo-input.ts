import { BadRequestException } from '@nestjs/common';
import { Category, isCategory } from '../classifier/category';

export const MAX_CONTENT_LENGTH = 200;

export function parseContent(raw: unknown): string {
  if (typeof raw !== 'string') {
    throw new BadRequestException('메모를 입력해 주세요.');
  }
  const content = raw.trim();
  if (content.length === 0) {
    throw new BadRequestException('메모를 입력해 주세요.');
  }
  // code point 기준으로 센다. Postgres VARCHAR(200)과 같은 기준이다.
  if ([...content].length > MAX_CONTENT_LENGTH) {
    throw new BadRequestException(
      `메모는 ${MAX_CONTENT_LENGTH}자 이하로 입력해 주세요.`,
    );
  }
  return content;
}

export function parseCategory(raw: unknown): Category {
  if (!isCategory(raw)) {
    throw new BadRequestException('옮길 칸이 올바르지 않습니다.');
  }
  return raw;
}
