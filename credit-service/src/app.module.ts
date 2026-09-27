import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { BalanceAuthorizationGuard } from './api/balance-authorization.guard';
import { CorrelationIdInterceptor } from './api/correlation-id.interceptor';
import { InternalServiceAuthGuard } from './api/internal-service-auth.guard';
import { CreditController } from './api/credit.controller';
import { HealthController } from './api/health.controller';
import { UserAccessTokenGuard } from './api/user-access-token.guard';
import { CreditService } from './application/credit.service';
import configuration from './infrastructure/configuration';
import { InfrastructureModule } from './infrastructure/infrastructure.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('security.jwtAccessTokenSecret'),
        verifyOptions: {
          algorithms: ['HS256'],
          audience: config.getOrThrow<string>('security.jwtAudience'),
          issuer: config.getOrThrow<string>('security.jwtIssuer'),
        },
      }),
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
    UserAccessTokenGuard,
    BalanceAuthorizationGuard,
    {
      provide: APP_INTERCEPTOR,
      useClass: CorrelationIdInterceptor,
    },
  ],
})
export class AppModule {}
