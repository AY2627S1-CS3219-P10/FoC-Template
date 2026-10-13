import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import {
  ServiceClients,
  UpstreamFailure,
} from '../../src/infrastructure/service-clients';

describe('ServiceClients contracts', () => {
  const orderToken = 'order-token-at-least-32-characters-long';
  const config = new ConfigService({
    USER_SERVICE_URL: 'http://user.test',
    SUPPLIER_SERVICE_URL: 'http://supplier.test',
    CREDIT_SERVICE_URL: 'http://credit.test',
    CREDIT_ORDER_SERVICE_TOKEN: orderToken,
  });
  const clients = new ServiceClients(config);

  afterEach(() => jest.restoreAllMocks());

  it('uses the current Credit reserve, adjustment, and release contracts', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockImplementation(() =>
        Promise.resolve(new Response(JSON.stringify({ replayed: false }))),
      );
    const errandId = randomUUID();
    const requesterId = randomUUID();
    const operationId = randomUUID();

    await clients.reserve(errandId, requesterId, 20);
    await clients.adjust(errandId, operationId, requesterId, 35);
    await clients.release(errandId, requesterId, 35);

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://credit.test/v1/credit-reservations',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: `Bearer ${orderToken}`,
        }),
        body: JSON.stringify({ errandId, requesterId, amount: 20 }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      `http://credit.test/v1/credit-reservations/${errandId}/adjustment`,
      expect.objectContaining({
        body: JSON.stringify({
          requesterId,
          targetAmount: 35,
          idempotencyKey: operationId,
        }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      `http://credit.test/v1/credit-reservations/${errandId}/release`,
      expect.objectContaining({
        body: JSON.stringify({ requesterId, amount: 35 }),
      }),
    );
  });

  it('rejects malformed User Service identity responses', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'not-a-uuid',
          status: 'ACTIVE',
          emailVerifiedAt: 'not-a-date',
        }),
      ),
    );

    await expect(clients.identity('user-token')).rejects.toMatchObject({
      code: 'INVALID_SERVICE_RESPONSE',
      retryable: true,
    });
  });

  it('does not retry caller authorization failures indefinitely', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ code: 'FORBIDDEN' }), { status: 403 }),
      );

    await expect(
      clients.reserve(randomUUID(), randomUUID(), 20),
    ).rejects.toEqual(
      expect.objectContaining<Partial<UpstreamFailure>>({
        status: 403,
        retryable: false,
      }),
    );
  });
});
