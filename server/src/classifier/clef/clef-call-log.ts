import type { PrismaService } from '../../prisma/prisma.service';
import type { ClefOutcome } from './clef-classifier';

export interface ClefCallLog {
  /** start 이후 Cloudflare에 실제로 보낸 요청 수 */
  countSince(start: Date): Promise<number>;
  record(outcome: ClefOutcome): Promise<void>;
}

export const CLEF_CALL_LOG = Symbol('CLEF_CALL_LOG');

/** Cloudflare 무료 할당량과 같은 기준(UTC 자정)으로 하루를 자른다. */
export function startOfUtcDay(now: Date): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

export class PrismaClefCallLog implements ClefCallLog {
  constructor(private readonly prisma: PrismaService) {}

  countSince(start: Date): Promise<number> {
    return this.prisma.clefCall.count({ where: { createdAt: { gte: start } } });
  }

  async record(outcome: ClefOutcome): Promise<void> {
    await this.prisma.clefCall.create({ data: { outcome } });
  }
}
