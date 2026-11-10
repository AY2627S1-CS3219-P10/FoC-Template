/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of deactivate supplier code (DeactivateSupplierUseCase).
 * Author review: Validated DeactivateSupplierUseCase input handling, dependency calls, and success/error return paths; clarified local naming and control-flow formatting.
 */

import type { SupplierManagementRepositoryPort } from '../ports/supplier-management.repository.port.js';

export class DeactivateSupplierUseCase {
  constructor(private readonly repository: SupplierManagementRepositoryPort) {}

  execute(supplierId: string): Promise<void> {
    return this.repository.deactivateSupplier(supplierId);
  }
}
