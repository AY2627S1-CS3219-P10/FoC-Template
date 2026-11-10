/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of supplier-service/src/platform/http/configure-http-application.ts tooling configuration (configureHttpApplication).
 * Author review: Validated supplier-service/configure-http-application.ts settings for forbidNonWhitelisted, transform, whitelist; edited configuration layout and naming for consistency.
 */

import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';

export function configureHttpApplication(app: NestFastifyApplication): void {
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      forbidNonWhitelisted: true,
      transform: false,
      whitelist: true,
    }),
  );

  const openApiConfig = new DocumentBuilder()
    .setTitle('Friend on Campus Supplier Service')
    .setDescription('NUS supplier and pickup-location catalog API')
    .setVersion('0.1.0')
    .addBearerAuth(
      { bearerFormat: 'JWT', scheme: 'bearer', type: 'http' },
      'access-token',
    )
    .build();
  const openApiDocument = SwaggerModule.createDocument(app, openApiConfig);

  SwaggerModule.setup('docs', app, openApiDocument, {
    useGlobalPrefix: true,
  });
}
