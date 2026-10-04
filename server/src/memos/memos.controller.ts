import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { parseCategory, parseContent } from './memo-input';
import { MemosService } from './memos.service';

@Controller('memos')
export class MemosController {
  constructor(private readonly memos: MemosService) {}

  @Get()
  list() {
    return this.memos.list();
  }

  @Post()
  create(@Body() body: { content?: unknown } | undefined) {
    return this.memos.create(parseContent(body?.content));
  }

  @Patch(':id')
  move(
    @Param('id') id: string,
    @Body() body: { category?: unknown } | undefined,
  ) {
    return this.memos.move(id, parseCategory(body?.category));
  }
}
