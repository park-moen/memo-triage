import {
  DEFAULT_DAILY_LIMIT,
  isClefConfigured,
  loadClefConfig,
} from './clef-config';

describe('loadClefConfig', () => {
  it('환경 변수에서 값을 읽고 앞뒤 공백을 지운다', () => {
    expect(
      loadClefConfig({
        CLOUDFLARE_ACCOUNT_ID: ' acc ',
        CLOUDFLARE_API_TOKEN: ' tok ',
        CLEF_DAILY_LIMIT: '7',
      }),
    ).toEqual({ accountId: 'acc', apiToken: 'tok', dailyLimit: 7 });
  });

  it.each([[undefined], [''], ['abc'], ['-1'], ['1.5']])(
    'CLEF_DAILY_LIMIT %j는 기본값을 쓴다',
    (value) => {
      expect(loadClefConfig({ CLEF_DAILY_LIMIT: value }).dailyLimit).toBe(
        DEFAULT_DAILY_LIMIT,
      );
    },
  );

  it('CLEF_DAILY_LIMIT 0은 그대로 0이다', () => {
    expect(loadClefConfig({ CLEF_DAILY_LIMIT: '0' }).dailyLimit).toBe(0);
  });

  it('계정 ID와 토큰이 모두 있어야 설정된 것이다', () => {
    expect(
      isClefConfigured(
        loadClefConfig({
          CLOUDFLARE_ACCOUNT_ID: 'a',
          CLOUDFLARE_API_TOKEN: 't',
        }),
      ),
    ).toBe(true);
    expect(
      isClefConfigured(
        loadClefConfig({
          CLOUDFLARE_ACCOUNT_ID: 'a',
          CLOUDFLARE_API_TOKEN: '',
        }),
      ),
    ).toBe(false);
    expect(isClefConfigured(loadClefConfig({}))).toBe(false);
  });
});
