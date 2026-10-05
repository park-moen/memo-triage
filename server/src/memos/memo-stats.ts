import type { HitStats } from '@memo/shared';

export type { HitCount, HitStats } from '@memo/shared';

export function computeHitStats(
  memos: ReadonlyArray<{
    source: string;
    modelCategory: string;
    finalCategory: string;
  }>,
): HitStats {
  const stats: HitStats = {
    'clef-flash': { hit: 0, total: 0 },
    rule: { hit: 0, total: 0 },
  };
  for (const memo of memos) {
    if (memo.source !== 'rule' && memo.source !== 'clef-flash') continue;
    const count = stats[memo.source];
    count.total += 1;
    if (memo.modelCategory === memo.finalCategory) count.hit += 1;
  }
  return stats;
}
