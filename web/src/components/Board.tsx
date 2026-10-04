import { CATEGORIES, CATEGORY_LABELS, type Category, type Memo } from '../api';
import { MemoCard } from './MemoCard';

interface Props {
  memos: Memo[];
  onMove: (id: string, category: Category) => void;
}

export function Board({ memos, onMove }: Props) {
  return (
    <section className="board">
      {CATEGORIES.map((category) => {
        const items = memos.filter((memo) => memo.finalCategory === category);
        return (
          <div key={category} className="column">
            <h2>
              {CATEGORY_LABELS[category]} <span className="count">{items.length}</span>
            </h2>
            {items.length === 0 ? (
              <p className="empty">아직 없습니다</p>
            ) : (
              items.map((memo) => <MemoCard key={memo.id} memo={memo} onMove={onMove} />)
            )}
          </div>
        );
      })}
    </section>
  );
}
