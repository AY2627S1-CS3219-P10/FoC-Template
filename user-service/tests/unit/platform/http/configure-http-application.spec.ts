import { Controller, Get, type INestApplication } from '@nestjs/common';
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';

import { configureHttpApplication } from '../../../../src/platform/http/configure-http-application.js';

@Controller('cors-test')
class CorsTestController {
  @Get()
  respond(): { ok: true } {
    return { ok: true };
  }
}

describe('configureHttpApplication CORS', () => {
  let app: NestFastifyApplication;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [CorsTestController],
    }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    configureHttpApplication(app, {
      frontendOrigin: 'https://app.example.com',
    });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterEach(async () => {
    await (app as INestApplication).close();
  });

  it('allows only the configured frontend origin instead of a wildcard', async () => {
    const response = await app.inject({
      headers: { origin: 'https://app.example.com' },
      method: 'GET',
      url: '/api/cors-test',
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBe(
      'https://app.example.com',
    );
    expect(response.headers['access-control-allow-origin']).not.toBe('*');
  });

  it('does not emit an allow-origin header for another origin', async () => {
    const response = await app.inject({
      headers: { origin: 'https://untrusted.example.com' },
      method: 'GET',
      url: '/api/cors-test',
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });
});
