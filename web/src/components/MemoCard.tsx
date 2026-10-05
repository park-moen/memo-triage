import {
  CATEGORIES,
  CATEGORY_LABELS,
  FALLBACK_LABELS,
  SOURCE_LABELS,
  type Category,
  type Memo,
} from '../api';
import { ScoreBars } from './ScoreBars';

interface Props {
  memo: Memo;
  onMove: (id: string, category: Category) => void;
}

function badgeOf(memo: Memo): { label: string; className: string } {
  if (memo.source === 'clef-flash') {
    return { label: SOURCE_LABELS['clef-flash'], className: 'badge clef-flash' };
  }
  if (memo.fallbackReason) {
    return { label: '대체 규칙', className: 'badge fallback' };
  }
  return { label: SOURCE_LABELS.rule, className: 'badge rule' };
}

export function MemoCard({ memo, onMove }: Props) {
  const badge = badgeOf(memo);
  return (
    <article className="card">
      <p className="content">{memo.content}</p>
      <div className="meta">
        <span className={badge.className}>{badge.label}</span>
        {memo.fallbackReason && (
          <span className="fallback-reason">{FALLBACK_LABELS[memo.fallbackReason]}</span>
        )}
        {memo.note && <span className="note">{memo.note}</span>}
      </div>
      {memo.scores && <ScoreBars scores={memo.scores} />}
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
