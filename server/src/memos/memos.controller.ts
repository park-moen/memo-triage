import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { CreateMemoBodySchema, MoveMemoBodySchema } from '@memo/shared';
import { parseWith } from '../common/parse-with';
import { MemosService } from './memos.service';

@Controller('memos')
export class MemosController {
  constructor(private readonly memos: MemosService) {}

  @Get()
  list() {
    return this.memos.list();
  }

  @Post()
  create(@Body() body: unknown) {
    const { content } = parseWith(CreateMemoBodySchema, body);
    return this.memos.create(content);
  }

  @Patch(':id')
  move(@Param('id') id: string, @Body() body: unknown) {
    const { category } = parseWith(MoveMemoBodySchema, body);
    return this.memos.move(id, category);
  }
}
