import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request, { Response } from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import type { MemoDto } from '../src/memos/memo.dto';
import type { HitStats } from '../src/memos/memo-stats';
import { PrismaService } from '../src/prisma/prisma.service';

type ListBody = { memos: MemoDto[]; stats: HitStats };
type ErrorBody = { message: string };

const bodyOf = <T>(res: Response): T => res.body as T;

describe('Memos API (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await prisma.memo.deleteMany();
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  describe('POST /api/memos', () => {
    it('규칙 분류기로 분류해 저장한다', async () => {
      const res = await http()
        .post('/api/memos')
        .send({ content: '  배포 일정 PM한테 확인  ' })
        .expect(201);

      expect(res.body).toMatchObject({
        content: '배포 일정 PM한테 확인',
        modelCategory: 'check',
        finalCategory: 'check',
        source: 'rule',
        scores: null,
        note: "키워드 '확인' 일치",
      });
      const memo = bodyOf<MemoDto>(res);
      expect(typeof memo.id).toBe('string');
      expect(new Date(memo.createdAt).toString()).not.toBe('Invalid Date');
    });

    it('공백뿐인 메모는 400과 한국어 문구를 돌려준다', async () => {
      const res = await http()
        .post('/api/memos')
        .send({ content: '   ' })
        .expect(400);
      expect(bodyOf<ErrorBody>(res).message).toBe('메모를 입력해 주세요.');
    });

    it('body가 없어도 500이 아니라 400이다', async () => {
      await http().post('/api/memos').expect(400);
    });

    it('한글 200자는 저장하고 201자는 400이다', async () => {
      await http()
        .post('/api/memos')
        .send({ content: '가'.repeat(200) })
        .expect(201);
      await http()
        .post('/api/memos')
        .send({ content: '가'.repeat(201) })
        .expect(400);
    });

    it('이모지 200개도 DB에 저장된다 (앱과 DB의 글자 수 기준이 같다)', async () => {
      await http()
        .post('/api/memos')
        .send({ content: '😀'.repeat(200) })
        .expect(201);
    });
  });

  describe('GET /api/memos', () => {
    it('최신순 목록과 출처별 적중 횟수를 돌려준다', async () => {
      await prisma.memo.create({
        data: {
          content: '먼저 쓴 메모',
          modelCategory: 'todo',
          finalCategory: 'idea',
          source: 'rule',
          note: "키워드 '작성' 일치",
          createdAt: new Date('2026-10-01T00:00:00Z'),
        },
      });
      await prisma.memo.create({
        data: {
          content: '나중에 쓴 메모',
          modelCategory: 'reference',
          finalCategory: 'reference',
          source: 'rule',
          note: '일치한 키워드 없음',
          createdAt: new Date('2026-10-02T00:00:00Z'),
        },
      });

      const res = await http().get('/api/memos').expect(200);

      expect(bodyOf<ListBody>(res).memos.map((m) => m.content)).toEqual([
        '나중에 쓴 메모',
        '먼저 쓴 메모',
      ]);
      expect(bodyOf<ListBody>(res).stats).toEqual({
        'clef-flash': { hit: 0, total: 0 },
        rule: { hit: 1, total: 2 },
      });
    });
  });

  describe('PATCH /api/memos/:id', () => {
    it('칸을 옮기면 final만 바뀌고, 원래 칸으로 되돌리면 다시 적중이다', async () => {
      const created = await http()
        .post('/api/memos')
        .send({ content: '금요일까지 회의록 작성' })
        .expect(201);
      const { id } = bodyOf<MemoDto>(created);

      const moved = await http()
        .patch(`/api/memos/${id}`)
        .send({ category: 'idea' })
        .expect(200);
      expect(moved.body).toMatchObject({
        modelCategory: 'todo',
        finalCategory: 'idea',
      });
      expect(
        bodyOf<ListBody>(await http().get('/api/memos')).stats.rule,
      ).toEqual({
        hit: 0,
        total: 1,
      });

      await http()
        .patch(`/api/memos/${id}`)
        .send({ category: 'todo' })
        .expect(200);
      expect(
        bodyOf<ListBody>(await http().get('/api/memos')).stats.rule,
      ).toEqual({
        hit: 1,
        total: 1,
      });
    });

    it('잘못된 칸은 400이다', async () => {
      const created = await http()
        .post('/api/memos')
        .send({ content: '메모' })
        .expect(201);
      const res = await http()
        .patch(`/api/memos/${bodyOf<MemoDto>(created).id}`)
        .send({ category: '할 일' })
        .expect(400);
      expect(bodyOf<ErrorBody>(res).message).toBe(
        '옮길 칸이 올바르지 않습니다.',
      );
    });

    it('없는 id는 404다', async () => {
      const res = await http()
        .patch('/api/memos/not-a-real-id')
        .send({ category: 'todo' })
        .expect(404);
      expect(bodyOf<ErrorBody>(res).message).toBe('메모를 찾을 수 없습니다.');
    });
  });
});
