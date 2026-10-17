import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { stdTimeFunctions } from 'pino';
import type { IncomingMessage } from 'node:http';
import { CorrelationMiddleware } from './api/correlation.middleware';
import {
  correlationIdFor,
  currentCorrelationId,
} from './infrastructure/correlation';
import { AuthGuard } from './api/auth.guard';
import { OrderController, OperationController } from './api/order.controller';
import { HealthController } from './api/health.controller';
import { OrderService } from './application/order.service';
import { ORDER_REPOSITORY, SERVICE_CLIENTS } from './application/ports';
import { PrismaService } from './infrastructure/prisma.service';
import { PrismaOrderRepository } from './infrastructure/order.repository';
import { ServiceClients } from './infrastructure/service-clients';
import { RecoveryWorker } from './infrastructure/recovery.worker';
import { OutboxRelay } from './infrastructure/outbox.relay';
function validate(env: Record<string, unknown>) {
  for (const name of [
    'DATABASE_URL',
    'REDIS_URL',
    'CREDIT_ORDER_SERVICE_TOKEN',
  ])
    if (typeof env[name] !== 'string' || !env[name])
      throw new Error(`${name} is required`);
  if ((env.CREDIT_ORDER_SERVICE_TOKEN as string).trim().length < 32)
    throw new Error(
      'CREDIT_ORDER_SERVICE_TOKEN must contain at least 32 non-whitespace characters',
    );
  const values = {
    PORT: 3004,
    USER_SERVICE_URL: 'http://127.0.0.1:3001',
    SUPPLIER_SERVICE_URL: 'http://127.0.0.1:3002',
    CREDIT_SERVICE_URL: 'http://127.0.0.1:3003',
    ...env,
  };
  for (const name of [
    'USER_SERVICE_URL',
    'SUPPLIER_SERVICE_URL',
    'CREDIT_SERVICE_URL',
  ] as const) {
    const url = new URL(String(values[name]));
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password
    )
      throw new Error(`${name} must be an HTTP(S) origin`);
  }
  const port = Number(values.PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error('PORT is invalid');
  return values;
}
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL || 'info',
        redact: ['req.headers.authorization', 'req.headers.cookie'],
        base: { service: 'order-service' },
        timestamp: stdTimeFunctions.isoTime,
        formatters: { level: (severity: string) => ({ severity }) },
        // Request logs carry the id as req.id; every other line gets correlationId.
        genReqId: (request: IncomingMessage) => correlationIdFor(request),
        mixin: () => {
          const correlationId = currentCorrelationId();
          return correlationId ? { correlationId } : {};
        },
      },
    }),
  ],
  controllers: [OrderController, OperationController, HealthController],
  providers: [
    PrismaService,
    AuthGuard,
    OrderService,
    RecoveryWorker,
    OutboxRelay,
    { provide: ORDER_REPOSITORY, useClass: PrismaOrderRepository },
    { provide: SERVICE_CLIENTS, useClass: ServiceClients },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(CorrelationMiddleware)
      .forRoutes(OrderController, OperationController, HealthController);
  }
}
