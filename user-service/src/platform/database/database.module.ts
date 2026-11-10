/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of database module code (DatabaseModule).
 * Author review: Checked DatabaseModule imports, provider registrations, and exports against the existing references; organized module declaration formatting (user-service/src/platform/database/database.module.ts).
 */

import { Module } from '@nestjs/common';

import { PrismaService } from './prisma.service.js';

@Module({
  exports: [PrismaService],
  providers: [PrismaService],
})
export class DatabaseModule {}
