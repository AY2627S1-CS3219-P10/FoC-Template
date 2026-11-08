import http from 'k6/http';
import { check } from 'k6';
import { SharedArray } from 'k6/data';
import { Rate } from 'k6/metrics';
import { baseUrl } from './lib/config.js';

const accounts = new SharedArray('preflight account', () => [
  JSON.parse(open(__ENV.STRESS_ACCOUNT_FILE || './secrets/stress-user.json')),
]);
const webUrl = baseUrl('WEB_BASE_URL', 'http://localhost:3000');
const failures = new Rate('preflight_failures');

export const options = {
  vus: 1,
  iterations: 1,
  thresholds: {
    preflight_failures: ['rate==0'],
    http_req_failed: ['rate==0'],
    http_req_duration: ['p(95)<2000'],
  },
};

export default function () {
  const account = accounts[0];
  if (!account.email || !account.password) {
    throw new Error('stress-user.json must contain email and password.');
  }

  const loginPage = http.get(`${webUrl}/login`, {
    tags: { endpoint: 'preflight-login-page' },
  });
  const login = http.post(
    `${webUrl}/api/auth/login`,
    JSON.stringify({ email: account.email, password: account.password }),
    {
      headers: {
        'Content-Type': 'application/json',
        Origin: webUrl,
        'Sec-Fetch-Site': 'same-origin',
      },
      tags: { endpoint: 'preflight-login' },
    },
  );
  const accessCookie = login.cookies.foc_access?.[0]?.value;
  const errands = accessCookie
    ? http.get(`${webUrl}/api/errands?limit=1&offset=0&sort=newest`, {
        headers: { Cookie: `foc_access=${accessCookie}` },
        tags: { endpoint: 'preflight-authenticated-errands' },
      })
    : null;

  const ok = check(
    { loginPage, login, errands },
    {
      'CloudFront login page returns 200': (result) =>
        result.loginPage.status === 200,
      'test account can log in': (result) => result.login.status === 200,
      'login returns an access cookie': () => Boolean(accessCookie),
      'authenticated errands reach Order Service': (result) =>
        result.errands?.status === 200,
      'authenticated errands return JSON': (result) =>
        result.errands?.headers['Content-Type']?.includes(
          'application/json',
        ) === true,
    },
  );
  failures.add(!ok);
}
