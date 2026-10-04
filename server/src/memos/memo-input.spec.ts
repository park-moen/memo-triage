import { BadRequestException } from '@nestjs/common';
import { parseCategory, parseContent } from './memo-input';

describe('parseContent', () => {
  it('앞뒤 공백을 지운다', () => {
    expect(parseContent('  회의록 작성  ')).toBe('회의록 작성');
  });

  it.each([[''], ['   '], ['\n\t ']])('공백뿐인 입력 %j는 거절한다', (raw) => {
    expect(() => parseContent(raw)).toThrow(BadRequestException);
  });

  it.each([[undefined], [null], [42], [{}]])(
    '문자열이 아닌 %j는 거절한다',
    (raw) => {
      expect(() => parseContent(raw)).toThrow(BadRequestException);
    },
  );

  it('한글 200자는 받고 201자는 거절한다', () => {
    expect(parseContent('가'.repeat(200))).toHaveLength(200);
    expect(() => parseContent('가'.repeat(201))).toThrow(BadRequestException);
  });

  it('이모지는 한 글자로 센다', () => {
    const twoHundred = '😀'.repeat(200);
    expect(parseContent(twoHundred)).toBe(twoHundred);
    expect(() => parseContent('😀'.repeat(201))).toThrow(BadRequestException);
  });

  it('오류 문구는 화면에 그대로 보여줄 한국어 문장이다', () => {
    expect(() => parseContent('가'.repeat(201))).toThrow(
      '메모는 200자 이하로 입력해 주세요.',
    );
    expect(() => parseContent(' ')).toThrow('메모를 입력해 주세요.');
  });
});

describe('parseCategory', () => {
  it.each(['todo', 'idea', 'check', 'reference'])('%s는 받는다', (raw) => {
    expect(parseCategory(raw)).toBe(raw);
  });

  it.each([['할 일'], ['TODO'], [undefined], [1]])('%j는 거절한다', (raw) => {
    expect(() => parseCategory(raw)).toThrow(BadRequestException);
  });
});
