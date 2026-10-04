import {
  ArgumentsHost,
  Catch,
  HttpException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';

export const SERVER_ERROR_MESSAGE =
  '서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.';

/** 처리하지 못한 오류도 화면에 그대로 보여줄 한국어 문구로 응답한다. HttpException은 그대로 둔다. */
@Catch()
export class ServerErrorFilter extends BaseExceptionFilter {
  private readonly logger = new Logger(ServerErrorFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    if (exception instanceof HttpException) {
      super.catch(exception, host);
      return;
    }
    this.logger.error(
      exception instanceof Error ? exception.stack : String(exception),
    );
    super.catch(new InternalServerErrorException(SERVER_ERROR_MESSAGE), host);
  }
}
