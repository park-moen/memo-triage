import { Module } from '@nestjs/common';
import { CLASSIFIER } from '../classifier/category';
import {
  CLEF_CALL_LOG,
  PrismaClefCallLog,
  type ClefCallLog,
} from '../classifier/clef/clef-call-log';
import {
  CLEF_FETCH,
  ClefClassifier,
  type FetchLike,
} from '../classifier/clef/clef-classifier';
import {
  CLEF_CONFIG,
  loadClefConfig,
  type ClefConfig,
} from '../classifier/clef/clef-config';
import { ResilientClassifier } from '../classifier/resilient-classifier';
import { RuleClassifier } from '../classifier/rule-classifier';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import { MemosController } from './memos.controller';
import { MemosService } from './memos.service';

@Module({
  imports: [PrismaModule],
  controllers: [MemosController],
  providers: [
    MemosService,
    { provide: CLEF_CONFIG, useFactory: (): ClefConfig => loadClefConfig() },
    {
      provide: CLEF_FETCH,
      useValue: ((url, init) => fetch(url, init)) satisfies FetchLike,
    },
    {
      provide: CLEF_CALL_LOG,
      useFactory: (prisma: PrismaService): ClefCallLog =>
        new PrismaClefCallLog(prisma),
      inject: [PrismaService],
    },
    {
      provide: CLASSIFIER,
      useFactory: (config: ClefConfig, fetchFn: FetchLike, log: ClefCallLog) =>
        new ResilientClassifier(
          config,
          new ClefClassifier(config, fetchFn),
          log,
          new RuleClassifier(),
        ),
      inject: [CLEF_CONFIG, CLEF_FETCH, CLEF_CALL_LOG],
    },
  ],
})
export class MemosModule {}
