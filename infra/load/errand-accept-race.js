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

  const sessions = accounts.slice(0, competitors).map((account, index) => {
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

  // An acceptance fixture is single-use. Fail before starting the race when a
  // previous run already assigned, cancelled, expired, or removed this errand.
  const fixtureResponse = http.get(
    `${webUrl}/api/errands/${errandId}`,
    {
      responseCallback: http.expectedStatuses(200),
      headers: {
        Cookie: sessions[0],
        'Cache-Control': 'no-cache',
      },
      tags: { endpoint: 'accept-race-fixture-check' },
    },
  );
  let fixture = null;
  try {
    fixture = fixtureResponse.json();
  } catch (_) {
    // The explicit error below reports the malformed fixture response.
  }
  if (
    fixtureResponse.status !== 200 ||
    fixture?.id !== errandId ||
    fixture?.status !== 'OPEN' ||
    fixture?.courierId !== null ||
    fixture?.availableForAcceptance !== true
  ) {
    throw new Error(
      `ERRAND_ID ${errandId} is not a fresh OPEN errand visible to the courier accounts. ` +
        'Create a new disposable errand and rerun; acceptance fixtures are single-use.',
    );
  }

  return sessions;
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

  const unexpected = response.status !== 200 && response.status !== 409;
  if (response.status === 200) winners.add(1);
  else if (response.status === 409) expectedConflicts.add(1);
  unexpectedResults.add(unexpected);

  if (unexpected) {
    console.error(
      JSON.stringify({
        event: 'unexpected_accept_race_response',
        vu: __VU,
        status: response.status,
        contentType: response.headers['Content-Type'] || 'missing',
        bodyPreview: String(response.body || '').slice(0, 300),
      }),
    );
  }

  check(response, {
    'only a success or concurrency conflict is returned': (item) =>
      item.status === 200 || item.status === 409,
  });
}
