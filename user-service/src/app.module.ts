/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of app module code (AppModule).
 * Author review: Checked AppModule imports, provider registrations, and exports against the existing references; organized module declaration formatting (user-service/src/app.module.ts).
 */

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AccountsModule } from './modules/accounts/accounts.module.js';
import { validateEnvironment } from './platform/config/environment.schema.js';
import { DatabaseModule } from './platform/database/database.module.js';
import { HealthController } from './platform/health/health.controller.js';

@Module({
  controllers: [HealthController],
  imports: [
    ConfigModule.forRoot({
      cache: true,
      isGlobal: true,
      validate: validateEnvironment,
    }),
    AccountsModule,
    DatabaseModule,
  ],
})
export class AppModule {}
