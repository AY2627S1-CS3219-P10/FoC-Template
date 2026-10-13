import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
} from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { OrderError } from '../domain/errand';
import { UpstreamFailure } from '../infrastructure/service-clients';
@Catch()
export class HttpFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const reply = host.switchToHttp().getResponse<FastifyReply>();
    if (error instanceof HttpException) {
      reply.status(error.getStatus()).send(error.getResponse());
      return;
    }
    if (error instanceof OrderError) {
      reply
        .status(error.status)
        .send({ code: error.code, message: error.message });
      return;
    }
    if (error instanceof UpstreamFailure) {
      reply.status(error.retryable ? 503 : error.status).send({
        code: error.code,
        message:
          'A required service could not complete this request. Try again shortly.',
      });
      return;
    }
    reply.status(503).send({
      code: 'SERVICE_UNAVAILABLE',
      message:
        'The request could not be completed. Retry using the same idempotency key.',
    });
  }
}
