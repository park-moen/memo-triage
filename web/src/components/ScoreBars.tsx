import { CATEGORIES, CATEGORY_LABELS, type Category } from '../api';

/** Clef-flash가 낸 칸별 확률. 높은 순으로 그리고 가장 높은 칸을 강조한다. */
export function ScoreBars({ scores }: { scores: Record<Category, number> }) {
  const ordered = [...CATEGORIES].sort((a, b) => scores[b] - scores[a]);
  const top = ordered[0];
  return (
    <ul className="scores" aria-label="칸별 확률">
      {ordered.map((category) => {
        const percent = Math.round(scores[category] * 100);
        return (
          <li key={category} className={category === top ? 'score top' : 'score'}>
            <span className="score-label">{CATEGORY_LABELS[category]}</span>
            <span className="score-track">
              <span className="score-fill" style={{ width: `${percent}%` }} />
            </span>
            <span className="score-value">{percent}%</span>
          </li>
        );
      })}
    </ul>
  );
}
