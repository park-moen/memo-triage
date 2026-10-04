import { Module } from '@nestjs/common';
import { MemosModule } from './memos/memos.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [PrismaModule, MemosModule],
})
export class AppModule {}
