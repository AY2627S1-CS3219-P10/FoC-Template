import { SetMetadata } from '@nestjs/common';

export const INTERNAL_CALLER_METADATA = 'credit-service:internal-caller';

export type InternalCaller = 'monitoring' | 'order-service' | 'user-service';

export const InternalCallerOnly = (caller: InternalCaller) =>
  SetMetadata(INTERNAL_CALLER_METADATA, caller);
