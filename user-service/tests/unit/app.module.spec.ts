import { Test, type TestingModule } from '@nestjs/testing';

import { AppModule } from '../../src/app.module.js';

describe('AppModule', () => {
  it('compiles the application composition root', async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    expect(moduleRef).toBeDefined();
    await moduleRef.close();
  });
});
