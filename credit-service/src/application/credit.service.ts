import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  type ConsumedEvent,
  CREDIT_REPOSITORY,
  type AdjustReservationCommand,
  type CreditRepository,
  type ReleaseCreditsCommand,
  type ReserveCreditsCommand,
  type SettleCreditsCommand,
} from './credit.repository';

@Injectable()
export class CreditService {
  constructor(
    @Inject(CREDIT_REPOSITORY)
    private readonly repository: CreditRepository,
    private readonly config: ConfigService,
  ) {}

  initializeAccount(userId: string, correlationId: string) {
    return this.repository.initializeAccount(
      userId,
      this.config.getOrThrow<number>('credit.initialBalance'),
      correlationId,
    );
  }

  initializeAccountFromEvent(userId: string, event: ConsumedEvent) {
    return this.repository.initializeAccount(
      userId,
      this.config.getOrThrow<number>('credit.initialBalance'),
      event.eventId,
      event,
    );
  }

  getBalance(userId: string) {
    return this.repository.getBalance(userId);
  }

  getTransactionHistory(userId: string, limit: number, offset: number) {
    return this.repository.getTransactionHistory(userId, limit, offset);
  }

  reserve(command: ReserveCreditsCommand) {
    return this.repository.reserve(command);
  }

  adjust(command: AdjustReservationCommand) {
    return this.repository.adjust(command);
  }

  settle(command: SettleCreditsCommand) {
    return this.repository.settle(command);
  }

  settleFromEvent(
    command: Omit<SettleCreditsCommand, 'correlationId' | 'consumedEvent'>,
    event: ConsumedEvent,
  ) {
    return this.repository.settle({
      ...command,
      correlationId: event.eventId,
      consumedEvent: event,
    });
  }

  release(command: ReleaseCreditsCommand) {
    return this.repository.release(command);
  }

  isReady() {
    return this.repository.isReady();
  }
}
