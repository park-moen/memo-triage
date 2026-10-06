import { describe, expect, it } from 'vitest';
import {
  CATEGORIES,
  CategorySchema,
  CreateMemoBodySchema,
  FALLBACK_REASONS,
  FallbackReasonSchema,
  HitStatsSchema,
  MAX_CONTENT_LENGTH,
  MemoSchema,
  MoveMemoBodySchema,
  isClassifierSource,
} from '../src';

type SafeParse = { success: true } | { success: false; error: { issues: { message: string }[] } };
const messageOf = (result: SafeParse) =>
  result.success ? undefined : result.error.issues[0]?.message;

describe('상수', () => {
  it('칸 목록과 글자 수 상한', () => {
    expect(CATEGORIES).toEqual(['todo', 'idea', 'check', 'reference']);
    expect(MAX_CONTENT_LENGTH).toBe(200);
  });
});

describe('CategorySchema', () => {
  it('칸 이동 전용 오류 문구를 담지 않는다', () => {
    expect(messageOf(CategorySchema.safeParse('x'))).not.toBe('옮길 칸이 올바르지 않습니다.');
  });
});

describe('CreateMemoBodySchema', () => {
  it('앞뒤 공백을 지운다', () => {
    expect(CreateMemoBodySchema.parse({ content: '  회의록 작성  ' })).toEqual({ content: '회의록 작성' });
  });

  it.each([[''], ['   '], ['\n\t ']])('공백뿐인 content %j는 거절한다', (content) => {
    expect(messageOf(CreateMemoBodySchema.safeParse({ content }))).toBe('메모를 입력해 주세요.');
  });

  it.each([[undefined], [null], [42], [{}]])('문자열이 아닌 content %j는 거절한다', (content) => {
    expect(messageOf(CreateMemoBodySchema.safeParse({ content }))).toBe('메모를 입력해 주세요.');
  });

  it.each([[undefined], [null], ['회의록'], [[]]])('객체가 아닌 body %j는 거절한다', (body) => {
    expect(messageOf(CreateMemoBodySchema.safeParse(body))).toBe('메모를 입력해 주세요.');
  });

  it('한글 200자는 받고 201자는 거절한다', () => {
    expect(CreateMemoBodySchema.safeParse({ content: '가'.repeat(200) }).success).toBe(true);
    expect(messageOf(CreateMemoBodySchema.safeParse({ content: '가'.repeat(201) }))).toBe(
      '메모는 200자 이하로 입력해 주세요.',
    );
  });

  it('이모지는 한 글자로 센다', () => {
    expect(CreateMemoBodySchema.safeParse({ content: '😀'.repeat(200) }).success).toBe(true);
    expect(CreateMemoBodySchema.safeParse({ content: '😀'.repeat(201) }).success).toBe(false);
  });
});

describe('MoveMemoBodySchema', () => {
  it.each(['todo', 'idea', 'check', 'reference'])('%s는 받는다', (category) => {
    expect(MoveMemoBodySchema.parse({ category })).toEqual({ category });
  });

  it.each([['할 일'], ['TODO'], [undefined], [1]])('category %j는 거절한다', (category) => {
    expect(messageOf(MoveMemoBodySchema.safeParse({ category }))).toBe('옮길 칸이 올바르지 않습니다.');
  });

  it('body가 없으면 거절한다', () => {
    expect(messageOf(MoveMemoBodySchema.safeParse(undefined))).toBe('옮길 칸이 올바르지 않습니다.');
  });
});

describe('응답 schema', () => {
  const memo = {
    id: 'a1',
    content: '회의록 작성',
    modelCategory: 'todo',
    finalCategory: 'idea',
    scores: null,
    note: "키워드 '작성' 일치",
    source: 'rule',
    fallbackReason: null,
    createdAt: '2026-10-05T00:00:00.000Z',
  };

  it('server가 보내는 메모 모양을 받는다', () => {
    expect(MemoSchema.parse(memo)).toEqual(memo);
    const scores = { todo: 0.7, idea: 0.2, check: 0.05, reference: 0.05 };
    expect(MemoSchema.parse({ ...memo, scores, source: 'clef-flash' }).scores).toEqual(scores);
  });

  it('적중 집계는 두 출처를 모두 가진다', () => {
    expect(
      HitStatsSchema.parse({ rule: { hit: 1, total: 2 }, 'clef-flash': { hit: 0, total: 0 } }),
    ).toEqual({ rule: { hit: 1, total: 2 }, 'clef-flash': { hit: 0, total: 0 } });
    expect(HitStatsSchema.safeParse({ rule: { hit: 1, total: 2 } }).success).toBe(false);
  });
});

describe('대체 사유', () => {
  it('7개 코드를 정해진 순서로 가진다', () => {
    expect(FALLBACK_REASONS).toEqual([
      'timeout',
      'network',
      'invalid_response',
      'auth',
      'rate_limited',
      'daily_limit',
      'not_configured',
    ]);
  });

  it('정해진 코드만 받는다', () => {
    expect(FallbackReasonSchema.safeParse('timeout').success).toBe(true);
    expect(FallbackReasonSchema.safeParse('unknown').success).toBe(false);
  });

  it('메모는 fallbackReason으로 대체 이유를 담고, 없으면 null이다', () => {
    const fallback = {
      id: 'b2',
      content: '회의록 작성',
      modelCategory: 'todo',
      finalCategory: 'todo',
      scores: null,
      note: "키워드 '작성' 일치",
      source: 'rule',
      fallbackReason: 'timeout',
      createdAt: '2026-10-05T00:00:00.000Z',
    };
    expect(MemoSchema.parse(fallback).fallbackReason).toBe('timeout');
    expect(MemoSchema.safeParse({ ...fallback, fallbackReason: 'oops' }).success).toBe(false);
    const { fallbackReason: _omit, ...withoutField } = fallback;
    expect(MemoSchema.safeParse(withoutField).success).toBe(false);
  });
});

describe('출처', () => {
  it('isClassifierSource는 CLASSIFIER_SOURCES의 값만 참이다', () => {
    expect(isClassifierSource('rule')).toBe(true);
    expect(isClassifierSource('clef-flash')).toBe(true);
    expect(isClassifierSource('unknown')).toBe(false);
    expect(isClassifierSource(1)).toBe(false);
  });
});
