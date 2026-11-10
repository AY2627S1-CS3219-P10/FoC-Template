/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of repeated credit-request load checks.
 * Author review: Validated credit-idempotency.js request values, response checks, and fixture handling where used; edited helper naming and script formatting.
 */

import http from 'k6/http';
import { check } from 'k6';
import { Counter, Rate } from 'k6/metrics';
import {
  authHeaders,
  baseUrl,
  positiveInteger,
  required,
  requireSafetyFlag,
} from './lib/config.js';

const creditUrl = baseUrl('CREDIT_BASE_URL', 'http://localhost:3003');
const internalToken = required('CREDIT_ORDER_SERVICE_TOKEN');
const errandId = required('ERRAND_ID');
const requesterId = required('REQUESTER_ID');
const amount = positiveInteger('AMOUNT', 1);
const attempts = positiveInteger('ATTEMPTS', 20);

const created = new Counter('reservation_created');
const replayed = new Counter('reservation_replayed');
const unexpectedResults = new Rate('reservation_unexpected_results');

export const options = {
  scenarios: {
    duplicate_reservation_delivery: {
      executor: 'per-vu-iterations',
      vus: attempts,
      iterations: 1,
      maxDuration: '30s',
    },
  },
  thresholds: {
    reservation_created: ['count==1'],
    reservation_replayed: [`count==${Math.max(attempts - 1, 0)}`],
    reservation_unexpected_results: ['rate==0'],
    http_req_duration: ['p(95)<2000'],
  },
};

export function setup() {
  requireSafetyFlag('ALLOW_MUTATIONS');
}

export default function () {
  const response = http.post(
    `${creditUrl}/v1/credit-reservations`,
    JSON.stringify({ errandId, requesterId, amount }),
    {
      responseCallback: http.expectedStatuses(200, 201),
      headers: authHeaders(internalToken, {
        'X-Service-Name': 'order-service',
      }),
      tags: { endpoint: 'credit-reservation-idempotency' },
    },
  );

  let body = null;
  try {
    body = response.json();
  } catch (_) {
    // The status and the check below report malformed responses.
  }

  if (response.status === 201 && body?.replayed === false) created.add(1);
  else if (response.status === 200 && body?.replayed === true) replayed.add(1);
  else unexpectedResults.add(true);

  check(response, {
    'reservation is created once or replayed': () =>
      (response.status === 201 && body?.replayed === false) ||
      (response.status === 200 && body?.replayed === true),
  });
}
