import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request, { Response } from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { CLASSIFIER } from '../src/classifier/category';

const bodyOf = <T>(res: Response): T => res.body as T;

describe('처리하지 못한 서버 오류 (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(CLASSIFIER)
      .useValue({
        classify: () => Promise.reject(new Error('예상하지 못한 분류기 오류')),
      })
      .compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('500과 화면에 그대로 보여줄 한국어 문구를 돌려준다', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/memos')
      .send({ content: '회의록 작성' })
      .expect(500);
    expect(bodyOf<{ message: string }>(res).message).toBe(
      '서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.',
    );
  });

  it('입력 검사 오류(400)는 그대로 둔다', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/memos')
      .send({ content: ' ' })
      .expect(400);
    expect(bodyOf<{ message: string }>(res).message).toBe(
      '메모를 입력해 주세요.',
    );
  });
});
