/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of concurrent errand-acceptance load checks.
 * Author review: Validated errand-accept-race.js request values, response checks, and fixture handling where used; edited helper naming and script formatting.
 */

import http from 'k6/http';
import { check } from 'k6';
import { SharedArray } from 'k6/data';
import exec from 'k6/execution';
import { Counter, Rate } from 'k6/metrics';
import {
  baseUrl,
  positiveInteger,
  required,
  requireSafetyFlag,
} from './lib/config.js';

const accounts = new SharedArray('courier accounts', () =>
  JSON.parse(open(__ENV.COURIER_ACCOUNTS_FILE || './secrets/couriers.json')),
);
const webUrl = baseUrl('WEB_BASE_URL', 'http://localhost:3000');
const errandId = required('ERRAND_ID');
const competitors = positiveInteger('COMPETITORS', accounts.length);

const winners = new Counter('accept_winners');
const expectedConflicts = new Counter('accept_expected_conflicts');
const unexpectedResults = new Rate('accept_unexpected_results');

export const options = {
  scenarios: {
    simultaneous_acceptance: {
      executor: 'per-vu-iterations',
      vus: competitors,
      iterations: 1,
      maxDuration: '30s',
    },
  },
  thresholds: {
    accept_winners: ['count==1'],
    accept_expected_conflicts: [`count==${Math.max(competitors - 1, 0)}`],
    accept_unexpected_results: ['rate==0'],
    http_req_duration: ['p(95)<2000'],
  },
};

export function setup() {
  requireSafetyFlag('ALLOW_MUTATIONS');
  if (accounts.length < competitors) {
    throw new Error(
      `couriers.json contains ${accounts.length} accounts but COMPETITORS is ${competitors}.`,
    );
  }

  return accounts.slice(0, competitors).map((account, index) => {
    if (!account.email || !account.password) {
      throw new Error(
        `Courier account ${index + 1} is missing email or password.`,
      );
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
        tags: { endpoint: 'courier-login-setup' },
      },
    );
    if (response.status !== 200 || !response.cookies.foc_access?.[0]?.value) {
      throw new Error(
        `Courier login ${index + 1} failed with HTTP ${response.status}.`,
      );
    }
    return `foc_access=${response.cookies.foc_access[0].value}`;
  });
}

export default function (sessions) {
  const cookie = sessions[exec.vu.idInTest - 1];
  const response = http.post(
    `${webUrl}/api/errands/${errandId}/accept`,
    JSON.stringify({}),
    {
      responseCallback: http.expectedStatuses(200, 409),
      headers: {
        Cookie: cookie,
        'Content-Type': 'application/json',
        Origin: webUrl,
        'Sec-Fetch-Site': 'same-origin',
        'X-Correlation-Id': `k6-accept-${__VU}`,
      },
      tags: { endpoint: 'accept-race' },
    },
  );

  if (response.status === 200) winners.add(1);
  else if (response.status === 409) expectedConflicts.add(1);
  else unexpectedResults.add(true);

  check(response, {
    'only a success or concurrency conflict is returned': (item) =>
      item.status === 200 || item.status === 409,
  });
}
