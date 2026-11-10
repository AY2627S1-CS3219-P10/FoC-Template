/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of http exception filter code (HttpExceptionFilter).
 * Author review: Validated HttpExceptionFilter value handling and returned results in credit-service/http-exception.filter.ts; edited naming and formatting for readability.
 */

import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { CreditDomainError } from '../domain/credit.errors';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<FastifyRequest>();
    const response = context.getResponse<FastifyReply>();
    const correlationId = String(request.id);

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_SERVER_ERROR';
    let message: string | string[] = 'An unexpected error occurred';
    let details: Record<string, unknown> | undefined;

    if (exception instanceof CreditDomainError) {
      statusCode = exception.statusCode;
      code = exception.code;
      message = exception.message;
      details = exception.details;
    } else if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const payload = exception.getResponse();
      if (typeof payload === 'string') {
        message = payload;
      } else {
        const body = payload as { message?: string | string[]; error?: string };
        message = body.message ?? exception.message;
        code = statusCode === 400 ? 'VALIDATION_ERROR' : this.toCode(body.error);
      }
    }

    const logContext = {
      correlationId,
      method: request.method,
      path: request.url,
      statusCode,
      code,
      err: exception,
    };
    if (statusCode >= 500) {
      this.logger.error(logContext, 'Request failed');
    } else {
      this.logger.warn(logContext, 'Request rejected');
    }

    response.status(statusCode).send({
      statusCode,
      code,
      message,
      ...(details ? { details } : {}),
      correlationId,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }

  private toCode(error: string | undefined): string {
    return (error ?? 'HTTP_ERROR').toUpperCase().replaceAll(' ', '_');
  }
}
