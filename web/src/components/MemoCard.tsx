import {
  CATEGORIES,
  CATEGORY_LABELS,
  SOURCE_LABELS,
  type Category,
  type Memo,
} from '../api';

interface Props {
  memo: Memo;
  onMove: (id: string, category: Category) => void;
}

export function MemoCard({ memo, onMove }: Props) {
  return (
    <article className="card">
      <p className="content">{memo.content}</p>
      <div className="meta">
        <span className={`badge ${memo.source}`}>{SOURCE_LABELS[memo.source]}</span>
        {memo.note && <span className="note">{memo.note}</span>}
      </div>
      {memo.modelCategory !== memo.finalCategory && (
        <p className="moved">처음 분류: {CATEGORY_LABELS[memo.modelCategory]}</p>
      )}
      <label className="move">
        칸 이동
        <select
          value={memo.finalCategory}
          onChange={(event) => onMove(memo.id, event.target.value as Category)}
        >
          {CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {CATEGORY_LABELS[category]}
            </option>
          ))}
        </select>
      </label>
    </article>
  );
}
