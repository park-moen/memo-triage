import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CLASSIFIER } from '../classifier/category';
import type { Category, Classifier } from '../classifier/category';
import { PrismaService } from '../prisma/prisma.service';
import { MemoDto, toMemoDto } from './memo.dto';
import { computeHitStats, HitStats } from './memo-stats';

@Injectable()
export class MemosService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CLASSIFIER) private readonly classifier: Classifier,
  ) {}

  async list(): Promise<{ memos: MemoDto[]; stats: HitStats }> {
    const memos = await this.prisma.memo.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return { memos: memos.map(toMemoDto), stats: computeHitStats(memos) };
  }

  async create(content: string): Promise<MemoDto> {
    const result = await this.classifier.classify(content);
    const memo = await this.prisma.memo.create({
      data: {
        content,
        modelCategory: result.category,
        finalCategory: result.category,
        scores: result.scores ?? Prisma.DbNull,
        note: result.note,
        source: result.source,
      },
    });
    return toMemoDto(memo);
  }

  async move(id: string, category: Category): Promise<MemoDto> {
    const existing = await this.prisma.memo.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('메모를 찾을 수 없습니다.');
    }
    const memo = await this.prisma.memo.update({
      where: { id },
      data: { finalCategory: category },
    });
    return toMemoDto(memo);
  }
}
