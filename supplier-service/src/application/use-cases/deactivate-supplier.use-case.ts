import type { SupplierManagementRepositoryPort } from '../ports/supplier-management.repository.port.js';

export class DeactivateSupplierUseCase {
  constructor(private readonly repository: SupplierManagementRepositoryPort) {}

  execute(supplierId: string): Promise<void> {
    return this.repository.deactivateSupplier(supplierId);
  }
}
