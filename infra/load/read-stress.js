/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of read-request load scenarios.
 * Author review: Validated read-stress.js request values, response checks, and fixture handling where used; edited helper naming and script formatting.
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';
import { Rate } from 'k6/metrics';
import { baseUrl, positiveInteger } from './lib/config.js';

const accounts = new SharedArray('stress account', () => [
  JSON.parse(open(__ENV.STRESS_ACCOUNT_FILE || './secrets/stress-user.json')),
]);
const webUrl = baseUrl('WEB_BASE_URL', 'http://localhost:3000');
const maxVus = positiveInteger('MAX_VUS', 500);

const applicationFailures = new Rate('application_failures');

export const options = {
  scenarios: {
    campus_browsing: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: __ENV.RAMP_UP || '2m', target: Math.ceil(maxVus / 5) },
        {
          duration: __ENV.WARM_DURATION || '2m',
          target: Math.ceil(maxVus / 5),
        },
        { duration: __ENV.RAMP_TO_PEAK || '3m', target: maxVus },
        { duration: __ENV.PEAK_DURATION || '5m', target: maxVus },
        { duration: __ENV.RAMP_DOWN || '2m', target: 0 },
      ],
      gracefulRampDown: '30s',
    },
  },
  thresholds: {
    application_failures: ['rate<0.01'],
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<1000', 'p(99)<2000'],
    'http_req_duration{endpoint:authenticated-errands}': ['p(95)<1000'],
  },
};

export function setup() {
  if (__ENV.ALLOW_STRESS !== 'true') {
    throw new Error(
      'Set ALLOW_STRESS=true after confirming the target environment.',
    );
  }
  if ((__ENV.ENVIRONMENT || '').toLowerCase() === 'production') {
    throw new Error(
      'Stress tests must run against a dedicated test or staging environment.',
    );
  }

  const account = accounts[0];
  if (!account.email || !account.password) {
    throw new Error('stress-user.json must contain email and password.');
  }
  const response = http.post(
    `${webUrl}/api/auth/login`,
    JSON.stringify({ email: account.email, password: account.password }),
    {
      headers: {
        'Content-Type': 'application/json',
        Origin: webUrl,
        'Sec-Fetch-Site': 'same-origin',
      },
      tags: { endpoint: 'stress-login-setup' },
    },
  );
  if (response.status !== 200 || !response.cookies.foc_access?.[0]?.value) {
    throw new Error(`Stress-user login failed with HTTP ${response.status}.`);
  }
  return { cookie: `foc_access=${response.cookies.foc_access[0].value}` };
}

export default function (session) {
  const response = http.get(
    `${webUrl}/api/errands?limit=21&offset=0&sort=newest`,
    {
      headers: {
        'Cache-Control': 'no-cache',
        Cookie: session.cookie,
      },
      tags: { endpoint: 'authenticated-errands' },
    },
  );

  const ok = check(response, {
    'authenticated errands return 200': (item) => item.status === 200,
    'authenticated errands return JSON': (item) =>
      item.headers['Content-Type']?.includes('application/json') === true,
  });
  applicationFailures.add(!ok);
  sleep(Number.parseFloat(__ENV.THINK_TIME_SECONDS || '1'));
}
