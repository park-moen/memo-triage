export const CATEGORIES = ['todo', 'idea', 'check', 'reference'] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<Category, string> = {
  todo: '할 일',
  idea: '아이디어',
  check: '확인할 것',
  reference: '참고',
};

export type ClassifierSource = 'rule' | 'clef-flash';

export const SOURCE_LABELS: Record<ClassifierSource, string> = {
  rule: '규칙',
  'clef-flash': 'Clef-flash',
};

export interface Memo {
  id: string;
  content: string;
  modelCategory: Category;
  finalCategory: Category;
  scores: Record<Category, number> | null;
  note: string | null;
  source: ClassifierSource;
  createdAt: string;
}

export type HitCount = { hit: number; total: number };
export type HitStats = Record<ClassifierSource, HitCount>;

const SERVER_DOWN_MESSAGE =
  '서버에 연결할 수 없습니다. server가 실행 중인지 확인해 주세요.';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    throw new Error(SERVER_DOWN_MESSAGE);
  }
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      body && typeof body === 'object' && 'message' in body && typeof body.message === 'string'
        ? body.message
        : res.status >= 500
          ? SERVER_DOWN_MESSAGE
          : `요청에 실패했습니다 (${res.status}).`;
    throw new Error(message);
  }
  return body as T;
}

export function fetchMemos(): Promise<{ memos: Memo[]; stats: HitStats }> {
  return request('/api/memos');
}

export function createMemo(content: string): Promise<Memo> {
  return request('/api/memos', {
    method: 'POST',
    body: JSON.stringify({ content }),
  });
}

export function moveMemo(id: string, category: Category): Promise<Memo> {
  return request(`/api/memos/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ category }),
  });
}
