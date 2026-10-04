// 개발 DB(memo)를 건드리지 않도록 e2e 테스트는 memo_test를 쓴다.
process.env.DATABASE_URL = 'postgresql://memo:memo@localhost:5433/memo_test';
