import { ServiceUnavailableException } from '@nestjs/common';

import type { PrismaService } from '../../../src/platform/database/prisma.service.js';
import { HealthController } from '../../../src/platform/health/health.controller.js';

describe('User Service HealthController', () => {
  it('reports liveness without touching the database', () => {
    let calls = 0;
    const prisma = {
      $queryRaw: () => {
        calls += 1;
        return Promise.resolve([{ '?column?': 1 }]);
      },
    } as unknown as PrismaService;
    expect(new HealthController(prisma).live()).toEqual({ status: 'ok' });
    expect(calls).toBe(0);
  });

  it('reports database readiness and hides connection errors', async () => {
    const available = {
      $queryRaw: () => Promise.resolve([{ '?column?': 1 }]),
    } as unknown as PrismaService;
    await expect(new HealthController(available).ready()).resolves.toEqual({
      status: 'ok',
    });

    const unavailable = {
      $queryRaw: () => Promise.reject(new Error('secret connection')),
    } as unknown as PrismaService;
    await expect(new HealthController(unavailable).ready()).rejects.toThrow(
      ServiceUnavailableException,
    );
  });
});
