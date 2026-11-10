/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of user-service/src/platform/http/configure-http-application.ts tooling configuration (HttpApplicationOptions, configureHttpApplication).
 * Author review: Validated user-service/configure-http-application.ts settings for app, options, origin; edited configuration layout and naming for consistency.
 */

import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';

export interface HttpApplicationOptions {
  frontendOrigin?: string;
}

export function configureHttpApplication(
  app: NestFastifyApplication,
  options: HttpApplicationOptions = {},
): void {
  if (options.frontendOrigin) {
    app.enableCors({
      origin: (requestOrigin, callback) => {
        callback(
          null,
          requestOrigin === undefined ||
            requestOrigin === options.frontendOrigin,
        );
      },
    });
  }

  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      forbidNonWhitelisted: true,
      transform: false,
      whitelist: true,
    }),
  );

  const openApiConfig = new DocumentBuilder()
    .setTitle('Friend on Campus User Service')
    .setDescription('Student account API')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  const openApiDocument = SwaggerModule.createDocument(app, openApiConfig);

  SwaggerModule.setup('docs', app, openApiDocument, {
    useGlobalPrefix: true,
  });
}
