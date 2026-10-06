import type { Classifier, ClassifyResult, FallbackReason } from './category';
import type { ClefCallResult } from './clef/clef-classifier';
import { startOfUtcDay, type ClefCallLog } from './clef/clef-call-log';
import { isClefConfigured, type ClefConfig } from './clef/clef-config';

export const CLEF_MAX_ATTEMPTS = 3;

/** CLASSIFIER 자리에 꽂는 분류기. Clef-flash를 상한·재시도 규칙에 따라 부르고, 안 되면 규칙 분류기로 대체한다. */
export class ResilientClassifier implements Classifier {
  constructor(
    private readonly config: ClefConfig,
    private readonly clef: {
      classifyOnce(content: string): Promise<ClefCallResult>;
    },
    private readonly log: ClefCallLog,
    private readonly fallback: Classifier,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async classify(content: string): Promise<ClassifyResult> {
    if (!isClefConfigured(this.config)) {
      return this.fallbackWith(content, 'not_configured');
    }
    let reason: FallbackReason = 'daily_limit';
    for (let attempt = 1; attempt <= CLEF_MAX_ATTEMPTS; attempt += 1) {
      const usedToday = await this.log.countSince(startOfUtcDay(this.now()));
      if (usedToday >= this.config.dailyLimit) {
        reason = 'daily_limit';
        break;
      }
      const result = await this.clef.classifyOnce(content);
      await this.log.record(result.ok ? 'success' : result.reason);
      if (result.ok) {
        return {
          category: result.category,
          source: 'clef-flash',
          scores: result.scores,
          note: null,
          fallbackReason: null,
        };
      }
      reason = result.reason;
      if (!result.retryable) break;
    }
    return this.fallbackWith(content, reason);
  }

  private async fallbackWith(
    content: string,
    reason: FallbackReason,
  ): Promise<ClassifyResult> {
    const result = await this.fallback.classify(content);
    return { ...result, fallbackReason: reason };
  }
}
