import { ConfigService } from '@nestjs/config';
import type { IncomingMessage } from 'node:http';
import {
  CORRELATION_HEADER,
  correlationIdFor,
  currentCorrelationId,
  withCorrelationId,
} from '../../src/infrastructure/correlation';
import { ServiceClients } from '../../src/infrastructure/service-clients';

const request = (header?: string) =>
  ({
    headers: header === undefined ? {} : { [CORRELATION_HEADER]: header },
  }) as unknown as IncomingMessage;

describe('correlation ids (NFR8)', () => {
  afterEach(() => jest.restoreAllMocks());

  it('reuses a well-formed inbound id and keeps it stable per request', () => {
    const req = request('demo-run:42');
    expect(correlationIdFor(req)).toBe('demo-run:42');
    expect(correlationIdFor(req)).toBe('demo-run:42');
  });

  it('generates an id when the header is missing or malformed', () => {
    const missing = request();
    expect(correlationIdFor(missing)).toMatch(/^[0-9a-f-]{36}$/);
    expect(correlationIdFor(missing)).toBe(correlationIdFor(missing));
    expect(correlationIdFor(request('bad id with spaces'))).not.toBe(
      'bad id with spaces',
    );
    expect(correlationIdFor(request('x'.repeat(129)))).toHaveLength(36);
  });

  it('exposes the id inside its scope only and forwards it to other services', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response('{}'));
    const clients = new ServiceClients(
      new ConfigService({
        CREDIT_SERVICE_URL: 'http://credit.test',
        CREDIT_ORDER_SERVICE_TOKEN: 'order-token-at-least-32-characters-long',
      }),
    );
    expect(currentCorrelationId()).toBeUndefined();
    await withCorrelationId('trace-1', () =>
      clients.release('e', 'r', 1).then(() => {
        expect(currentCorrelationId()).toBe('trace-1');
      }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      'http://credit.test/v1/credit-reservations/e/release',
      expect.objectContaining({
        headers: expect.objectContaining({ [CORRELATION_HEADER]: 'trace-1' }),
      }),
    );
  });
});
