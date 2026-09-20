import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CREDIT_REPOSITORY,
  type CreditRepository,
  type ReserveCreditsCommand,
} from './credit.repository';

@Injectable()
export class CreditService {
  constructor(
    @Inject(CREDIT_REPOSITORY)
    private readonly repository: CreditRepository,
    private readonly config: ConfigService,
  ) {}

  initializeAccount(userId: string) {
    return this.repository.initializeAccount(
      userId,
      this.config.getOrThrow<number>('credit.initialBalance'),
    );
  }

  getBalance(userId: string) {
    return this.repository.getBalance(userId);
  }

  reserve(command: ReserveCreditsCommand) {
    return this.repository.reserve(command);
  }

  settle(errandId: string, courierId: string) {
    return this.repository.settle(errandId, courierId);
  }

  release(errandId: string) {
    return this.repository.release(errandId);
  }

  isReady() {
    return this.repository.isReady();
  }
}
