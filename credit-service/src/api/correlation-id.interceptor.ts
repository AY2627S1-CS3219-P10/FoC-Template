import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { randomUUID } from 'node:crypto';
import { PinoLogger } from 'nestjs-pino';
import type { Observable } from 'rxjs';

@Injectable()
export class CorrelationIdInterceptor implements NestInterceptor {
  constructor(private readonly logger: PinoLogger) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<FastifyRequest>();
    const response = http.getResponse<FastifyReply>();
    const supplied = request.headers['x-correlation-id'];
    const correlationId =
      typeof supplied === 'string' && supplied.length <= 128
        ? supplied
        : randomUUID();

    Object.defineProperty(request, 'id', {
      value: correlationId,
      configurable: true,
      enumerable: true,
    });
    response.header('x-correlation-id', correlationId);
    this.logger.assign({ correlationId });
    return next.handle();
  }
}
