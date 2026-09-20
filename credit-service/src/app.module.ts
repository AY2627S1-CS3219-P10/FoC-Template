import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { CorrelationIdInterceptor } from './api/correlation-id.interceptor';
import { InternalServiceAuthGuard } from './api/internal-service-auth.guard';
import { CreditController } from './api/credit.controller';
import { HealthController } from './api/health.controller';
import { CreditService } from './application/credit.service';
import configuration from './infrastructure/configuration';
import { InfrastructureModule } from './infrastructure/infrastructure.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    LoggerModule.forRoot({
      assignResponse: true,
      pinoHttp: {
        level: process.env.LOG_LEVEL || 'info',
        genReqId: (request, reply) => {
          const supplied = request.headers['x-correlation-id'];
          const correlationId =
            typeof supplied === 'string' && supplied.length <= 128
              ? supplied
              : randomUUID();
          reply.setHeader('x-correlation-id', correlationId);
          return correlationId;
        },
        redact: {
          paths: [
            'req.headers.authorization',
            'req.headers.cookie',
            'res.headers["set-cookie"]',
          ],
          censor: '[REDACTED]',
        },
      },
    }),
    InfrastructureModule,
  ],
  controllers: [CreditController, HealthController],
  providers: [
    CreditService,
    InternalServiceAuthGuard,
    {
      provide: APP_INTERCEPTOR,
      useClass: CorrelationIdInterceptor,
    },
  ],
})
export class AppModule {}
