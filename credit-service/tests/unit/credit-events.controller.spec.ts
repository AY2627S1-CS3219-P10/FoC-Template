import { BadRequestException } from '@nestjs/common';
import type { RmqContext } from '@nestjs/microservices';
import { randomUUID } from 'node:crypto';
import { CreditEventsController } from '../../src/api/credit-events.controller';
import {
  ERRAND_COMPLETED_EVENT,
  USER_VERIFIED_EVENT,
  type CreditEventsHandler,
} from '../../src/api/credit-events.handler';
import { EventReplayConflictError } from '../../src/domain/credit.errors';

describe('CreditEventsController acknowledgements', () => {
  const message = { fields: { deliveryTag: 1 } };
  const channel = { ack: jest.fn(), nack: jest.fn() };
  const context = {
    getChannelRef: () => channel,
    getMessage: () => message,
  } as unknown as RmqContext;
  const handler = {
    handleUserVerified: jest.fn(),
    handleErrandCompleted: jest.fn(),
  } as unknown as jest.Mocked<CreditEventsHandler>;
  const controller = new CreditEventsController(handler);

  beforeEach(() => jest.clearAllMocks());

  it('ACKs only after committed event handling resolves', async () => {
    handler.handleUserVerified.mockResolvedValue({} as never);
    await controller.consumeUserVerified(
      {
        eventId: randomUUID(),
        eventType: USER_VERIFIED_EVENT,
        data: { userId: randomUUID() },
      },
      context,
    );
    expect(channel.ack).toHaveBeenCalledWith(message);
    expect(channel.nack).not.toHaveBeenCalled();
  });

  it('requests redelivery after a transient failure', async () => {
    handler.handleErrandCompleted.mockRejectedValue(new Error('DB unavailable'));
    await controller.consumeErrandCompleted(
      {
        eventId: randomUUID(),
        eventType: ERRAND_COMPLETED_EVENT,
        data: {
          errandId: randomUUID(),
          requesterId: randomUUID(),
          courierId: randomUUID(),
          amount: 10,
        },
      },
      context,
    );
    expect(channel.ack).not.toHaveBeenCalled();
    expect(channel.nack).toHaveBeenCalledWith(message, false, true);
  });

  it.each([
    new EventReplayConflictError(randomUUID()),
    new BadRequestException('invalid event'),
  ])('rejects a permanent poison event without requeue', async (error) => {
    handler.handleUserVerified.mockRejectedValue(error);
    await controller.consumeUserVerified(
      {
        eventId: randomUUID(),
        eventType: USER_VERIFIED_EVENT,
        data: { userId: randomUUID() },
      },
      context,
    );
    expect(channel.ack).not.toHaveBeenCalled();
    expect(channel.nack).toHaveBeenCalledWith(message, false, false);
  });
});
