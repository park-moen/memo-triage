import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request, { Response } from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import {
  CLEF_FETCH,
  type FetchLike,
} from '../src/classifier/clef/clef-classifier';
import { CLEF_CONFIG } from '../src/classifier/clef/clef-config';
import type { MemoDto } from '../src/memos/memo.dto';
import { PrismaService } from '../src/prisma/prisma.service';

const bodyOf = <T>(res: Response): T => res.body as T;

const okBody = {
  result: {
    answers: {
      category: {
        type: 'choice',
        choice: 'check',
        probabilities: { todo: 0.15, idea: 0.02, check: 0.76, reference: 0.07 },
        confidence: 0.49,
      },
    },
  },
  success: true,
  errors: [],
  messages: [],
};

/** 응답을 차례로 돌려주는 가짜 fetch. 호출 수를 센다. */
function scriptedFetch(statuses: number[]) {
  const fake = {
    calls: 0,
    fn: (() => {
      const status = statuses[Math.min(fake.calls, statuses.length - 1)];
      fake.calls += 1;
      return Promise.resolve(
        new globalThis.Response(
          JSON.stringify(status === 200 ? okBody : { success: false }),
          { status },
        ),
      );
    }) as FetchLike,
  };
  return fake;
}

describe('Clef-flash 분류 (e2e, 가짜 Cloudflare)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let fake: ReturnType<typeof scriptedFetch>;

  async function start(statuses: number[], dailyLimit = 100) {
    fake = scriptedFetch(statuses);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(CLEF_CONFIG)
      .useValue({
        accountId: 'test-account',
        apiToken: 'test-token',
        dailyLimit,
      })
      .overrideProvider(CLEF_FETCH)
      .useValue(fake.fn)
      .compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    await prisma.memo.deleteMany();
    await prisma.clefCall.deleteMany();
  }

  afterEach(async () => {
    await app.close();
  });

  it('성공하면 clef-flash 결과와 칸별 확률을 저장하고 호출 1번을 기록한다', async () => {
    await start([200]);
    const res = await request(app.getHttpServer())
      .post('/api/memos')
      .send({ content: '배포 일정 PM한테 확인' })
      .expect(201);
    expect(bodyOf<MemoDto>(res)).toMatchObject({
      modelCategory: 'check',
      source: 'clef-flash',
      scores: { todo: 0.15, idea: 0.02, check: 0.76, reference: 0.07 },
      note: null,
      fallbackReason: null,
    });
    expect(fake.calls).toBe(1);
    expect(await prisma.clefCall.count({ where: { outcome: 'success' } })).toBe(
      1,
    );
  });

  it('5xx가 3번이면 규칙으로 대체하고 network를 남긴다', async () => {
    await start([503]);
    const res = await request(app.getHttpServer())
      .post('/api/memos')
      .send({ content: '회의록 작성' })
      .expect(201);
    expect(bodyOf<MemoDto>(res)).toMatchObject({
      modelCategory: 'todo',
      source: 'rule',
      scores: null,
      note: "키워드 '작성' 일치",
      fallbackReason: 'network',
    });
    expect(fake.calls).toBe(3);
    expect(await prisma.clefCall.count()).toBe(3);
  });

  it('401이면 1번만 호출하고 auth로 대체한다', async () => {
    await start([401]);
    const res = await request(app.getHttpServer())
      .post('/api/memos')
      .send({ content: '회의록 작성' })
      .expect(201);
    expect(bodyOf<MemoDto>(res).fallbackReason).toBe('auth');
    expect(fake.calls).toBe(1);
  });

  it('하루 상한에 닿아 있으면 호출하지 않고 daily_limit로 대체한다', async () => {
    await start([200], 1);
    await prisma.clefCall.create({ data: { outcome: 'success' } });
    const res = await request(app.getHttpServer())
      .post('/api/memos')
      .send({ content: '회의록 작성' })
      .expect(201);
    expect(bodyOf<MemoDto>(res).fallbackReason).toBe('daily_limit');
    expect(fake.calls).toBe(0);
  });

  it('GET은 fallbackReason을 포함해 돌려준다', async () => {
    await start([401]);
    await request(app.getHttpServer())
      .post('/api/memos')
      .send({ content: '회의록 작성' })
      .expect(201);
    const res = await request(app.getHttpServer())
      .get('/api/memos')
      .expect(200);
    expect(bodyOf<{ memos: MemoDto[] }>(res).memos[0].fallbackReason).toBe(
      'auth',
    );
  });
});

describe('토큰이 없는 기본 설정 (e2e)', () => {
  it('Cloudflare를 부르지 않고 not_configured로 대체한다', async () => {
    const fetchCalls: string[] = [];
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(CLEF_FETCH)
      .useValue((url: string) => {
        fetchCalls.push(url);
        return Promise.reject(new Error('호출되면 안 됨'));
      })
      .compile();
    const app: INestApplication<App> = moduleRef.createNestApplication({
      logger: false,
    });
    configureApp(app);
    await app.init();
    const res = await request(app.getHttpServer())
      .post('/api/memos')
      .send({ content: '회의록 작성' })
      .expect(201);
    expect(bodyOf<MemoDto>(res).fallbackReason).toBe('not_configured');
    expect(fetchCalls).toEqual([]);
    await app.close();
  });
});
