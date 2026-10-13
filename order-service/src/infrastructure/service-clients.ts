import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OrderError } from '../domain/errand';
import type { ErrandDetails } from '../domain/errand';

export class UpstreamFailure extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    public readonly retryable: boolean,
  ) {
    super('A required service could not complete the request.');
  }
}
@Injectable()
export class ServiceClients {
  constructor(private readonly config: ConfigService) {}
  async request<T>(
    service: 'USER' | 'SUPPLIER' | 'CREDIT',
    path: string,
    token: string,
    body?: object,
  ): Promise<T> {
    const url = this.config.getOrThrow<string>(`${service}_SERVICE_URL`);
    let response: Response;
    try {
      response = await fetch(`${url.replace(/\/$/, '')}/${path}`, {
        method: body ? 'POST' : 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        redirect: 'error',
        signal: AbortSignal.timeout(8000),
      });
    } catch {
      throw new UpstreamFailure('SERVICE_UNAVAILABLE', 503, true);
    }
    const data: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const code =
        data &&
        typeof data === 'object' &&
        'code' in data &&
        typeof data.code === 'string' &&
        /^[A-Z0-9_]{1,100}$/.test(data.code)
          ? data.code
          : 'UPSTREAM_REQUEST_FAILED';
      throw new UpstreamFailure(
        code,
        response.status,
        response.status >= 500 ||
          [401, 403].includes(response.status) ||
          code === 'CONCURRENT_OPERATION',
      );
    }
    if (!data) throw new UpstreamFailure('INVALID_SERVICE_RESPONSE', 503, true);
    return data as T;
  }
  async identity(token: string) {
    const profile = await this.request<{
      id: string;
      status: string;
      emailVerifiedAt: string | null;
    }>('USER', 'api/accounts/me', token);
    if (profile.status !== 'ACTIVE' || !profile.emailVerifiedAt)
      throw new OrderError(
        'ACTIVE_ACCOUNT_REQUIRED',
        'A verified, active account is required.',
        403,
      );
    return profile.id;
  }
  async isAdministrator(token: string) {
    const profile = await this.request<{ isAdmin: boolean }>(
      'USER',
      'api/accounts/me',
      token,
    );
    return profile.isAdmin === true;
  }
  async username(userId: string, token: string) {
    try {
      return (
        await this.request<{ username: string }>(
          'USER',
          `api/accounts/${userId}/identity`,
          token,
        )
      ).username;
    } catch (error) {
      if (error instanceof UpstreamFailure && error.status === 404) return null;
      throw error;
    }
  }
  async release(errandId: string) {
    try {
      await this.request(
        'CREDIT',
        `v1/credit-reservations/${errandId}/release`,
        this.config.getOrThrow<string>('CREDIT_INTERNAL_API_TOKEN'),
        {},
      );
    } catch (error) {
      if (
        !(error instanceof UpstreamFailure) ||
        error.code !== 'RESERVATION_STATE_CONFLICT'
      )
        throw error; /* Settled credits cannot be refunded by deleting a request. */
    }
  }
  async pickup(
    id: string,
    token: string,
  ): Promise<
    Pick<ErrandDetails, 'pickupSupplierName' | 'pickupLocationLabel'>
  > {
    const suppliers = await this.request<
      {
        name: string;
        locations: {
          id: string;
          building: string;
          floor: number;
          supplierAtLocation: string;
        }[];
      }[]
    >('SUPPLIER', 'api/suppliers', token);
    if (!Array.isArray(suppliers))
      throw new UpstreamFailure('INVALID_SERVICE_RESPONSE', 503, true);
    for (const supplier of suppliers) {
      const location = supplier.locations?.find((item) => item.id === id);
      if (
        location &&
        typeof supplier.name === 'string' &&
        typeof location.supplierAtLocation === 'string'
      ) {
        const label = location.supplierAtLocation;
        if (
          !supplier.name.trim() ||
          supplier.name.length > 150 ||
          !label.trim() ||
          label.length > 300
        )
          throw new UpstreamFailure('INVALID_SERVICE_RESPONSE', 503, true);
        return {
          pickupSupplierName: supplier.name,
          pickupLocationLabel: label,
        };
      }
    }
    throw new OrderError(
      'PICKUP_UNAVAILABLE',
      'This pickup location is unavailable for new errands.',
      400,
    );
  }
  async reserve(errandId: string, requesterId: string, amount: number) {
    const token = this.config.getOrThrow<string>('CREDIT_INTERNAL_API_TOKEN');
    await this.request('CREDIT', 'v1/credit-accounts', token, {
      userId: requesterId,
    });
    await this.request('CREDIT', 'v1/credit-reservations', token, {
      errandId,
      requesterId,
      amount,
    });
  }
  async adjust(
    errandId: string,
    operationId: string,
    requesterId: string,
    expectedAmount: number,
    amount: number,
  ) {
    await this.request(
      'CREDIT',
      `v1/credit-reservations/${errandId}/adjustment`,
      this.config.getOrThrow<string>('CREDIT_INTERNAL_API_TOKEN'),
      { operationId, requesterId, expectedAmount, amount },
    );
  }
}
