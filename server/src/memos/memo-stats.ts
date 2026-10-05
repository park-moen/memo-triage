import {
  CLASSIFIER_SOURCES,
  isClassifierSource,
  type HitStats,
} from '@memo/shared';

export type { HitCount, HitStats } from '@memo/shared';

export function computeHitStats(
  memos: ReadonlyArray<{
    source: string;
    modelCategory: string;
    finalCategory: string;
  }>,
): HitStats {
  const stats = Object.fromEntries(
    CLASSIFIER_SOURCES.map((source) => [source, { hit: 0, total: 0 }]),
  ) as HitStats;
  for (const memo of memos) {
    if (!isClassifierSource(memo.source)) continue;
    const count = stats[memo.source];
    count.total += 1;
    if (memo.modelCategory === memo.finalCategory) count.hit += 1;
  }
  return stats;
}
