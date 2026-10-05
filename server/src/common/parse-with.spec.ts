import { BadRequestException } from '@nestjs/common';
import { CreateMemoBodySchema, MoveMemoBodySchema } from '@memo/shared';
import { parseWith } from './parse-with';

describe('parseWith', () => {
  it('통과하면 schema가 변환한 값을 돌려준다', () => {
    expect(
      parseWith(CreateMemoBodySchema, { content: '  회의록 작성 ' }),
    ).toEqual({
      content: '회의록 작성',
    });
  });

  it('실패하면 첫 오류 문구로 BadRequestException을 던진다', () => {
    expect(() => parseWith(CreateMemoBodySchema, { content: ' ' })).toThrow(
      new BadRequestException('메모를 입력해 주세요.'),
    );
    expect(() => parseWith(MoveMemoBodySchema, { category: '할 일' })).toThrow(
      new BadRequestException('옮길 칸이 올바르지 않습니다.'),
    );
  });
});
