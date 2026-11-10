export function required(name) {
  const value = __ENV[name];
  if (!value || !value.trim()) {
    throw new Error(`${name} is required.`);
  }
  return value.trim();
}

export function baseUrl(name, fallback) {
  return (__ENV[name] || fallback).replace(/\/$/, '');
}

export function positiveInteger(name, fallback) {
  const value = Number.parseInt(__ENV[name] || String(fallback), 10);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return value;
}

export function requireSafetyFlag(flag) {
  if (__ENV[flag] !== 'true') {
    throw new Error(
      `${flag}=true is required because this test changes persistent state.`,
    );
  }
  if ((__ENV.ENVIRONMENT || '').toLowerCase() === 'production') {
    throw new Error('Mutation load tests must never run against production.');
  }
}

export function authHeaders(token, extra = {}) {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'X-Correlation-Id': `k6-${__VU}-${__ITER}`,
    ...extra,
  };
}
