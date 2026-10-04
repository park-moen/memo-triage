import { INestApplication } from '@nestjs/common';
import { ServerErrorFilter } from './server-error.filter';

export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix('api');
  app.useGlobalFilters(new ServerErrorFilter(app.getHttpAdapter()));
}
