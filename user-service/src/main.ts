import 'reflect-metadata';

import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';

import { AppModule } from './app.module.js';
import type { EnvironmentVariables } from './platform/config/environment.schema.js';
import { configureHttpApplication } from './platform/http/configure-http-application.js';

const DEFAULT_PORT = 3001;

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
  );

  const config = app.get(ConfigService<EnvironmentVariables, true>);
  configureHttpApplication(app, {
    frontendOrigin: config.get('FRONTEND_ORIGIN', { infer: true }),
  });
  app.enableShutdownHooks();

  const port = Number(process.env.PORT ?? DEFAULT_PORT);
  await app.listen(port, '0.0.0.0');
}

void bootstrap();
