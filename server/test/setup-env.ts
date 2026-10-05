// 개발 DB(memo)를 건드리지 않도록 e2e 테스트는 memo_test를 쓴다.
process.env.DATABASE_URL = 'postgresql://memo:memo@localhost:5433/memo_test';
// server/.env에 실제 토큰이 있어도 e2e는 Cloudflare를 부르지 않는다(not_configured).
// Clef-flash 경로는 각 테스트가 CLEF_CONFIG·CLEF_FETCH를 가짜로 바꿔 검증한다.
process.env.CLOUDFLARE_ACCOUNT_ID = '';
process.env.CLOUDFLARE_API_TOKEN = '';
