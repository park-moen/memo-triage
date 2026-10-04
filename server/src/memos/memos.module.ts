import { Module } from '@nestjs/common';
import { CLASSIFIER } from '../classifier/category';
import { RuleClassifier } from '../classifier/rule-classifier';
import { PrismaModule } from '../prisma/prisma.module';
import { MemosController } from './memos.controller';
import { MemosService } from './memos.service';

@Module({
  imports: [PrismaModule],
  controllers: [MemosController],
  providers: [
    MemosService,
    // 2단계에서 Clef-flash 분류기로 바꿔 끼우는 지점
    { provide: CLASSIFIER, useClass: RuleClassifier },
  ],
})
export class MemosModule {}
