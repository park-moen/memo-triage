export interface ClefConfig {
  accountId: string;
  apiToken: string;
  /** 하루(UTC) 최대 호출 수. 0이면 호출하지 않는다. */
  dailyLimit: number;
}

export const CLEF_CONFIG = Symbol('CLEF_CONFIG');
export const DEFAULT_DAILY_LIMIT = 100;

export function loadClefConfig(
  env: Record<string, string | undefined> = process.env,
): ClefConfig {
  const rawLimit = env.CLEF_DAILY_LIMIT?.trim() ?? '';
  const limit = Number(rawLimit);
  return {
    accountId: env.CLOUDFLARE_ACCOUNT_ID?.trim() ?? '',
    apiToken: env.CLOUDFLARE_API_TOKEN?.trim() ?? '',
    dailyLimit:
      rawLimit !== '' && Number.isInteger(limit) && limit >= 0
        ? limit
        : DEFAULT_DAILY_LIMIT,
  };
}

export function isClefConfigured(config: ClefConfig): boolean {
  return config.accountId !== '' && config.apiToken !== '';
}
