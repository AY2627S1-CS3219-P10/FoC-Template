/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of app module test cases.
 * Author review: Validated the assertions and setup for "compiles the application composition root"; clarified test descriptions and assertion formatting.
 */

import { Test, type TestingModule } from '@nestjs/testing';

import { AppModule } from '../../src/app.module.js';
import { PrismaService } from '../../src/platform/database/prisma.service.js';

describe('AppModule', () => {
  it('compiles the application composition root', async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    expect(moduleRef).toBeDefined();
    expect(moduleRef.get(PrismaService)).toBeDefined();
    await moduleRef.close();
  });
});
