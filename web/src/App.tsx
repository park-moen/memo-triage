import { useCallback, useEffect, useState } from 'react';
import { createMemo, fetchMemos, moveMemo, type Category, type HitStats, type Memo } from './api';
import { Board } from './components/Board';
import { HitStatsBar } from './components/HitStatsBar';
import { MemoInput } from './components/MemoInput';
import './App.css';

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.';
}

export default function App() {
  const [memos, setMemos] = useState<Memo[]>([]);
  const [stats, setStats] = useState<HitStats | null>(null);
  const [pendingContent, setPendingContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const data = await fetchMemos();
    setMemos(data.memos);
    setStats(data.stats);
  }, []);

  useEffect(() => {
    reload().catch((e: unknown) => setError(toMessage(e)));
  }, [reload]);

  async function handleSubmit(content: string): Promise<boolean> {
    setError(null);
    setPendingContent(content);
    try {
      await createMemo(content);
    } catch (e) {
      setError(toMessage(e));
      setPendingContent(null);
      return false; // 저장 실패: 입력창의 메모를 그대로 둔다
    }
    setPendingContent(null);
    // 저장은 끝났으므로 목록 갱신이 실패해도 입력창은 비운다(같은 메모의 중복 저장 방지).
    await reload().catch((e: unknown) => setError(toMessage(e)));
    return true;
  }

  function handleMove(id: string, category: Category) {
    setError(null);
    moveMemo(id, category)
      .then(reload)
      .catch((e: unknown) => setError(toMessage(e)));
  }

  return (
    <main className="app">
      <header className="app-header">
        <h1>메모 분류함</h1>
        {stats && <HitStatsBar stats={stats} />}
      </header>
      <MemoInput onSubmit={handleSubmit} disabled={pendingContent !== null} />
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {pendingContent && (
        <div className="card pending" aria-live="polite">
          <p className="content">{pendingContent}</p>
          <p className="note">분류 중…</p>
        </div>
      )}
      <Board memos={memos} onMove={handleMove} />
    </main>
  );
}
