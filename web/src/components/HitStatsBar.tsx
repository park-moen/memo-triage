import { SOURCE_LABELS, type ClassifierSource, type HitStats } from '../api';

const ORDER: ClassifierSource[] = ['clef-flash', 'rule'];

export function HitStatsBar({ stats }: { stats: HitStats }) {
  return (
    <p className="hit-stats">
      적중{' '}
      {ORDER.map((source) => `${SOURCE_LABELS[source]} ${stats[source].hit}/${stats[source].total}`).join(' · ')}
    </p>
  );
}
