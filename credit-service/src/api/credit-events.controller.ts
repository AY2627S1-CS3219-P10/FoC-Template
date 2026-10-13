import { Controller, HttpException, HttpStatus, Logger } from '@nestjs/common';
import {
  Ctx,
  EventPattern,
  Payload,
  RmqContext,
} from '@nestjs/microservices';
import { CreditDomainError } from '../domain/credit.errors';
import {
  CreditEventsHandler,
  ERRAND_COMPLETED_EVENT,
  USER_VERIFIED_EVENT,
  type ErrandCompletedData,
  type UserVerifiedData,
} from './credit-events.handler';

interface EventEnvelope<T> {
  eventId: string;
  eventType: string;
  data: T;
}

@Controller()
export class CreditEventsController {
  private readonly logger = new Logger(CreditEventsController.name);

  constructor(private readonly handler: CreditEventsHandler) {}

  @EventPattern(USER_VERIFIED_EVENT)
  consumeUserVerified(
    @Payload() event: EventEnvelope<UserVerifiedData>,
    @Ctx() context: any,
  ) {
    return this.consume(context, event, () =>
      this.handler.handleUserVerified(event),
    );
  }

  @EventPattern(ERRAND_COMPLETED_EVENT)
  consumeErrandCompleted(
    @Payload() event: EventEnvelope<ErrandCompletedData>,
    @Ctx() context: any,
  ) {
    return this.consume(context, event, () =>
      this.handler.handleErrandCompleted(event),
    );
  }

  private async consume(
    context: RmqContext,
    event: { eventId?: unknown; eventType?: unknown },
    operation: () => Promise<unknown>,
  ): Promise<void> {
    const channel = context.getChannelRef();
    const message = context.getMessage();
    try {
      await operation();
      // ACK only after the database transaction has committed.
      channel.ack(message);
    } catch (error) {
      const permanent =
        (error instanceof CreditDomainError &&
          error.statusCode === 409 &&
          error.code !== 'CONCURRENT_OPERATION') ||
        (error instanceof HttpException &&
          error.getStatus() >= HttpStatus.BAD_REQUEST &&
          error.getStatus() < HttpStatus.INTERNAL_SERVER_ERROR &&
          error.getStatus() !== HttpStatus.NOT_FOUND);
      this.logger.error(
        {
          eventId:
            typeof event?.eventId === 'string' ? event.eventId : undefined,
          eventType:
            typeof event?.eventType === 'string' ? event.eventType : undefined,
          permanent,
          error: error instanceof Error ? error.message : String(error),
        },
        permanent
          ? 'Rejecting conflicting credit event'
          : 'Credit event processing failed; requesting redelivery',
      );
      // Conflicting replays are poison messages; transient/ordering failures
      // remain unacknowledged and are redelivered.
      channel.nack(message, false, !permanent);
    }
  }
}
