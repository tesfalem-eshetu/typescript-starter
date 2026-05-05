import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Server } from 'http';
import { AppModule } from '../../src/app.module';
import { HttpExceptionFilter } from '../../src/common/filters/http-exception.filter';
import { startPostgres, StartedPostgres } from './postgres.container';

export interface E2ETestContext {
  app: INestApplication;
  httpServer: Server;
  postgres: StartedPostgres;
  close: () => Promise<void>;
}

export async function createTestApp(): Promise<E2ETestContext> {
  const postgres = await startPostgres();

  process.env.NODE_ENV = 'test';
  process.env.DB_HOST = postgres.connection.host;
  process.env.DB_PORT = String(postgres.connection.port);
  process.env.DB_USER = postgres.connection.user;
  process.env.DB_PASSWORD = postgres.connection.password;
  process.env.DB_NAME = postgres.connection.database;
  process.env.DB_SYNCHRONIZE = 'true';
  process.env.DB_LOGGING = 'false';

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication({ logger: false });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());

  await app.init();

  const httpServer = app.getHttpServer() as Server;

  return {
    app,
    httpServer,
    postgres,
    close: async () => {
      await app.close();
      await postgres.container.stop();
    },
  };
}
