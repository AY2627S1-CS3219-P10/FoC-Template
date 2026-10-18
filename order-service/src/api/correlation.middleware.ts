import { Injectable, NestMiddleware } from '@nestjs/common';
import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  CORRELATION_HEADER,
  correlationIdFor,
  withCorrelationId,
} from '../infrastructure/correlation';

/**
 * Runs the rest of the request (guards, handlers, outbound calls, logs) inside the
 * request's correlation id. Middleware runs before guards, so AuthGuard's call to
 * user-service carries the id too.
 */
@Injectable()
export class CorrelationMiddleware implements NestMiddleware {
  use(request: IncomingMessage, response: ServerResponse, next: () => void) {
    const id = correlationIdFor(request);
    response.setHeader(CORRELATION_HEADER, id);
    withCorrelationId(id, next);
  }
}
