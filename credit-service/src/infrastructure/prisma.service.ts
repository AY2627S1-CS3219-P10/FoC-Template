import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);
  private readonly startupTimeoutMs: number;
  private readonly retryIntervalMs: number;

  constructor(config: ConfigService) {
    const connectionString = config.getOrThrow<string>('DATABASE_URL');
    const poolMax = config.getOrThrow<number>('database.poolMax');
    const connectionTimeoutMillis = config.getOrThrow<number>(
      'database.connectionTimeoutMs',
    );
    const idleTimeoutMillis = config.getOrThrow<number>(
      'database.idleTimeoutMs',
    );
    super({
      adapter: new PrismaPg({
        connectionString,
        max: poolMax,
        connectionTimeoutMillis,
        idleTimeoutMillis,
      }),
    });
    this.startupTimeoutMs =
      config.getOrThrow<number>('database.startupTimeoutSeconds') * 1_000;
    this.retryIntervalMs =
      config.getOrThrow<number>('database.retryIntervalSeconds') * 1_000;
  }

  async onModuleInit(): Promise<void> {
    const deadline = Date.now() + this.startupTimeoutMs;
    let attempt = 0;

    while (true) {
      attempt += 1;
      try {
        await this.$connect();
        await this.$queryRaw`SELECT 1`;
        this.logger.log({ attempt }, 'PostgreSQL connection is ready');
        return;
      } catch (error) {
        const remainingMs = deadline - Date.now();
        if (remainingMs <= 0) {
          this.logger.error(
            { attempt, err: error },
            'PostgreSQL did not become ready before the startup deadline',
          );
          throw error;
        }
        this.logger.warn(
          { attempt, retryInMs: Math.min(this.retryIntervalMs, remainingMs) },
          'PostgreSQL is unavailable; retrying startup connection',
        );
        await new Promise((resolve) =>
          setTimeout(resolve, Math.min(this.retryIntervalMs, remainingMs)),
        );
      }
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
