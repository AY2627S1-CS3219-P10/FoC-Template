/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of HTTP smoke-check scenarios.
 * Author review: Validated smoke.js request values, response checks, and fixture handling where used; edited helper naming and script formatting.
 */

import http from 'k6/http';
import { check } from 'k6';
import { Rate } from 'k6/metrics';
import { baseUrl } from './lib/config.js';

const webUrl = baseUrl('WEB_BASE_URL', 'http://localhost:3000');

const failures = new Rate('smoke_failures');

export const options = {
  vus: 1,
  iterations: 3,
  thresholds: {
    smoke_failures: ['rate==0'],
    http_req_failed: ['rate==0'],
    http_req_duration: ['p(95)<1000'],
  },
};

export default function () {
  const responses = http.batch([
    ['GET', `${webUrl}/login`, null, { tags: { endpoint: 'web-login' } }],
    [
      'GET',
      `${webUrl}/api/errands?limit=21&offset=0&sort=newest`,
      null,
      { tags: { endpoint: 'public-errands' } },
    ],
  ]);

  const ok = check(responses, {
    'login page is reachable': (items) => items[0].status === 200,
    'public errands traverse web and order services': (items) =>
      items[1].status === 200,
  });
  failures.add(!ok);
}
