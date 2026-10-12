import { BadRequestException, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { isUUID } from 'class-validator';
import { CreditService } from '../application/credit.service';
import { MAX_CREDIT_BALANCE } from '../domain/credit.constants';

export const USER_VERIFIED_EVENT = 'user.verified.v1';
export const ERRAND_COMPLETED_EVENT = 'errand.completed.v1';

interface EventEnvelope<T> {
  eventId: string;
  eventType: string;
  data: T;
}

export interface UserVerifiedData {
  userId: string;
}

export interface ErrandCompletedData {
  errandId: string;
  requesterId: string;
  courierId: string;
  amount: number;
}

@Injectable()
export class CreditEventsHandler {
  constructor(private readonly creditService: CreditService) {}

  handleUserVerified(event: EventEnvelope<UserVerifiedData>) {
    this.assertEnvelope(event, USER_VERIFIED_EVENT);
    if (
      !event.data ||
      !this.hasExactlyKeys(event.data, ['userId']) ||
      !isUUID(event.data.userId, '4')
    ) {
      throw new BadRequestException('UserVerified contains an invalid userId');
    }
    return this.creditService.initializeAccountFromEvent(
      event.data.userId,
      this.metadata(event),
    );
  }

  handleErrandCompleted(event: EventEnvelope<ErrandCompletedData>) {
    this.assertEnvelope(event, ERRAND_COMPLETED_EVENT);
    const data = event.data;
    if (
      !data ||
      !this.hasExactlyKeys(data, [
        'amount',
        'courierId',
        'errandId',
        'requesterId',
      ]) ||
      !isUUID(data.errandId, '4') ||
      !isUUID(data.requesterId, '4') ||
      !isUUID(data.courierId, '4') ||
      !Number.isSafeInteger(data.amount) ||
      data.amount <= 0 ||
      data.amount > MAX_CREDIT_BALANCE
    ) {
      throw new BadRequestException('ErrandCompleted contains invalid data');
    }
    return this.creditService.settleFromEvent(data, this.metadata(event));
  }

  private assertEnvelope(
    event: EventEnvelope<unknown>,
    expectedType: string,
  ): void {
    if (!isUUID(event?.eventId, '4') || event?.eventType !== expectedType) {
      throw new BadRequestException('Event envelope is invalid');
    }
  }

  private metadata<T>(event: EventEnvelope<T>) {
    return {
      eventId: event.eventId,
      eventType: event.eventType,
      payloadHash: createHash('sha256')
        .update(JSON.stringify(event.data), 'utf8')
        .digest('hex'),
    };
  }

  private hasExactlyKeys(
    value: object,
    expectedKeys: string[],
  ): boolean {
    const keys = Object.keys(value).sort();
    return (
      keys.length === expectedKeys.length &&
      keys.every((key, index) => key === expectedKeys[index])
    );
  }
}
